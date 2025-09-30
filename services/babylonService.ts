// Add a global declaration for the BABYLON object to satisfy TypeScript
declare const BABYLON: any;

interface AppendModelOptions {
    hideMeshes?: boolean;
    makeCollidable?: boolean;
}

/**
 * Appends a model from a file or URL to the scene.
 * @param fileOrUrl The file object or string URL of the model.
 * @param scene The Babylon scene to append to.
 * @param options Configuration options for loading.
 * @returns An object containing the new meshes, skeletons, and animation groups.
 */
export async function appendModelToScene(
    fileOrUrl: File | string,
    scene: any, // BABYLON.Scene
    options: AppendModelOptions = {}
): Promise<{ newMeshes: any[], newSkels: any[], newAG: any[] }> {
    const { hideMeshes = false, makeCollidable = false } = options;
    
    const url = typeof fileOrUrl === "string" ? fileOrUrl : URL.createObjectURL(fileOrUrl);

    let result: any;
    try {
        // Use `null` to import all meshes, which is more explicit than `""`.
        result = await BABYLON.SceneLoader.ImportMeshAsync(null, "", url, scene, undefined, ".glb");
    } catch (e) {
        console.error("Error loading model:", e);
        return { newMeshes: [], newSkels: [], newAG: [] };
    } finally {
        if (typeof fileOrUrl !== "string") URL.revokeObjectURL(url);
    }
    
    const { meshes: newMeshes, skeletons: newSkels, animationGroups: newAG } = result;

    newMeshes.forEach((mesh: any) => {
        if (hideMeshes) {
            mesh.setEnabled(false);
        }
        if (makeCollidable) {
            mesh.checkCollisions = true;
        }
    });

    return { newMeshes, newSkels, newAG };
}

/**
 * Retargets an animation group from a source skeleton to a target skeleton.
 * @param sourceAnimGroup The source animation group.
 * @param targetSkeleton The skeleton to retarget the animations to.
 * @param mapping A dictionary to map source bone names to target bone names.
 * @param scene The scene to create the new AnimationGroup in.
 * @returns A new AnimationGroup retargeted to the target skeleton.
 */
export function retargetAnimationGroup(
    sourceAnimGroup: any, // BABYLON.AnimationGroup
    targetSkeleton: any, // BABYLON.Skeleton
    mapping: Record<string, string>,
    scene: any // BABYLON.Scene
): any /* BABYLON.AnimationGroup */ {
    const newAnimationGroup = new BABYLON.AnimationGroup(sourceAnimGroup.name, scene);

    for (const targetedAnim of sourceAnimGroup.targetedAnimations) {
        const sourceAnimation = targetedAnim.animation;
        const sourceBoneName = (targetedAnim.target as any).name; // as BABYLON.Bone

        const targetBoneName = mapping[sourceBoneName] || sourceBoneName;
        const targetBone = targetSkeleton.bones.find((b: any) => b.name === targetBoneName);
        
        if (targetBone) {
            const newAnimation = sourceAnimation.clone();
            newAnimationGroup.addTargetedAnimation(newAnimation, targetBone);
        }
    }
    
    newAnimationGroup.normalize(sourceAnimGroup.from, sourceAnimGroup.to);
    return newAnimationGroup;
}

/**
 * Exports the given nodes and animations to a GLB file.
 * @param scene The Babylon scene.
 * @param nodesToExport An array of meshes and transform nodes to include in the export.
 * @param animationGroups An array of animation groups to include.
 * @param fileName The name of the downloaded file.
 */
export async function exportGLB(
    scene: any, // BABYLON.Scene
    nodesToExport: any[], // (BABYLON.AbstractMesh | BABYLON.TransformNode)[]
    animationGroups: any[], // BABYLON.AnimationGroup[]
    fileName: string
): Promise<void> {
    const glb = await BABYLON.GLTF2Export.GLBAsync(scene, fileName.replace(/\.glb$/, ''), {
        shouldExportTransformNode: (node: any) => nodesToExport.includes(node as any),
        animationGroups: animationGroups,
    });
    glb.downloadFiles();
}


// --- Auto-Mapping Logic ---

const boneKeywordMap: Record<string, string[]> = {
    'head': ['head'],
    'neck': ['neck'],
    'spine': ['spine', 'chest'],
    'hips': ['hips', 'pelvis'],
    'leg': ['leg', 'thigh', 'shin'],
    'knee': ['knee'],
    'foot': ['foot'],
    'toes': ['toe', 'toes'],
    'shoulder': ['shoulder', 'clavicle'],
    'arm': ['arm', 'bicep'],
    'elbow': ['elbow', 'forearm'],
    'hand': ['hand', 'wrist'],
    'finger': ['finger'],
    'thumb': ['thumb'],
    'index': ['index'],
    'middle': ['middle'],
    'ring': ['ring'],
    'pinky': ['pinky', 'little'],
};

const sideIdentifiers = {
    'left': ['l', 'left'],
    'right': ['r', 'right'],
};

function normalizeBoneName(name: string): string {
    return name.toLowerCase().replace(/[-_.:]/g, '');
}

function getBoneFeatures(normalizedName: string): { keywords: Set<string>, side: 'left' | 'right' | 'center' } {
    const features = {
        keywords: new Set<string>(),
        side: 'center' as 'left' | 'right' | 'center',
    };

    for (const s of sideIdentifiers.left) {
        if (normalizedName.includes(s)) {
            features.side = 'left';
            break;
        }
    }
    if (features.side === 'center') {
        for (const s of sideIdentifiers.right) {
            if (normalizedName.includes(s)) {
                features.side = 'right';
                break;
            }
        }
    }
    
    for (const [standard, variations] of Object.entries(boneKeywordMap)) {
        for (const variation of variations) {
            if (normalizedName.includes(variation)) {
                features.keywords.add(standard);
            }
        }
    }
    return features;
}

/**
 * Intelligently maps bone names from a source list to a target skeleton based on keywords.
 * @param sourceBoneNames An array of bone names from the source skeleton.
 * @param targetSkeleton The target Babylon.js skeleton.
 * @returns A mapping table from source bone name to target bone name.
 */
export function autoMapBones(
    sourceBoneNames: string[],
    targetSkeleton: any // BABYLON.Skeleton
): Record<string, string> {
    const mapping: Record<string, string> = {};
    const targetBones = targetSkeleton.bones;
    const availableTargetBones = new Set(targetBones.map((b: any) => b.name));

    const getScore = (sourceFeatures: ReturnType<typeof getBoneFeatures>, targetFeatures: ReturnType<typeof getBoneFeatures>): number => {
        let score = 0;
        if (sourceFeatures.side === targetFeatures.side) {
            score += 100;
        } else if (sourceFeatures.side !== 'center' && targetFeatures.side !== 'center') {
            return -1; // Don't map left to right
        }

        for (const keyword of sourceFeatures.keywords) {
            if (targetFeatures.keywords.has(keyword)) {
                score += 10;
            }
        }
        
        if (sourceFeatures.keywords.size > 0 && targetFeatures.keywords.size > 0) {
            score += 1;
        }
        return score;
    };

    for (const sourceName of sourceBoneNames) {
        const normalizedSourceName = normalizeBoneName(sourceName);
        const sourceFeatures = getBoneFeatures(normalizedSourceName);

        let bestMatch: string | null = null;
        let bestScore = 0;

        for (const targetBone of targetBones) {
            const targetName = targetBone.name;
            if (!availableTargetBones.has(targetName)) continue;

            const normalizedTargetName = normalizeBoneName(targetName);
            const targetFeatures = getBoneFeatures(normalizedTargetName);
            
            const score = getScore(sourceFeatures, targetFeatures);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = targetName;
            }
        }

        if (bestMatch && bestScore > 0) {
            mapping[sourceName] = bestMatch;
            availableTargetBones.delete(bestMatch); // Prevent one target bone from being mapped twice
        } else {
            // Fallback to 1:1 if no good match is found
            mapping[sourceName] = sourceName;
        }
    }

    return mapping;
}
