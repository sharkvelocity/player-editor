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
): Promise<{ newMeshes: any[], newSkels: any[], newAG: any[], newTNs: any[] }> {
    const { hideMeshes = false, makeCollidable = false } = options;
    
    const url = typeof fileOrUrl === "string" ? fileOrUrl : URL.createObjectURL(fileOrUrl);

    let result: any;
    try {
        // Use `null` to import all meshes, which is more explicit than `""`.
        result = await BABYLON.SceneLoader.ImportMeshAsync(null, "", url, scene, undefined, ".glb");
    } catch (e) {
        console.error("Error loading model:", e);
        return { newMeshes: [], newSkels: [], newAG: [], newTNs: [] };
    } finally {
        if (typeof fileOrUrl !== "string") URL.revokeObjectURL(url);
    }
    
    const { meshes: newMeshes, skeletons: newSkels, animationGroups: newAG, transformNodes: newTNs } = result;

    newMeshes.forEach((mesh: any) => {
        if (hideMeshes) {
            mesh.setEnabled(false);
        }
        if (makeCollidable) {
            mesh.checkCollisions = true;
        }
    });

    return { newMeshes, newSkels, newAG, newTNs };
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

        // New logic: Check for an explicit, non-empty mapping.
        const targetBoneName = mapping[sourceBoneName];
        
        // If targetBoneName is defined and not an empty string, proceed.
        if (targetBoneName) {
            const targetBone = targetSkeleton.bones.find((b: any) => b.name === targetBoneName);
            
            if (targetBone) {
                const newAnimation = sourceAnimation.clone();
                newAnimationGroup.addTargetedAnimation(newAnimation, targetBone);
            }
        }
        // If targetBoneName is empty ('') or undefined, we intentionally skip this bone's animation track.
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
    'shoulder': ['shoulder', 'clavicle', 'breast', 'pec'],
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
 * This version uses a non-greedy approach by scoring all possible pairs and matching the best ones first.
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
    // FIX: Explicitly type the Set as Set<string> to ensure correct type inference for loop variables.
    // This resolves downstream type errors where the loop variable was inferred as 'unknown'.
    const targetBoneNames = new Set<string>(targetBones.map((b: any) => b.name));

    const getScore = (sourceFeatures: ReturnType<typeof getBoneFeatures>, targetFeatures: ReturnType<typeof getBoneFeatures>): number => {
        let score = 0;
        // Side scoring: Heavily weighted but allows for side-to-center matching.
        if (sourceFeatures.side === targetFeatures.side) {
            score += 50;
        } else if (sourceFeatures.side === 'center' || targetFeatures.side === 'center') {
            score += 25; // Lower score for mapping a side bone to a central one.
        } else { // This is Left vs Right
            return -1; // Invalid match.
        }

        // Keyword scoring: Rewards shared understanding of the bone's purpose.
        let keywordMatches = 0;
        for (const keyword of sourceFeatures.keywords) {
            if (targetFeatures.keywords.has(keyword)) {
                keywordMatches++;
            }
        }
        score += keywordMatches * 20;

        // Small tie-breaker bonus if both bones have keywords but none matched.
        // This prioritizes matching two bones with semantic meaning over one with and one without.
        if (sourceFeatures.keywords.size > 0 && targetFeatures.keywords.size > 0 && keywordMatches === 0) {
            score += 1;
        }
        
        return score;
    };

    // 1. Calculate scores for all possible pairs above a minimum threshold.
    const allPairs: { source: string; target: string; score: number }[] = [];
    for (const sourceName of sourceBoneNames) {
        const normalizedSourceName = normalizeBoneName(sourceName);
        const sourceFeatures = getBoneFeatures(normalizedSourceName);

        for (const targetName of targetBoneNames) {
            const normalizedTargetName = normalizeBoneName(targetName);
            const targetFeatures = getBoneFeatures(normalizedTargetName);
            
            const score = getScore(sourceFeatures, targetFeatures);
            if (score > 1) { // Use a threshold to ignore extremely weak matches.
                allPairs.push({ source: sourceName, target: targetName, score: score });
            }
        }
    }

    // 2. Sort all pairs by score, highest to lowest.
    allPairs.sort((a, b) => b.score - a.score);

    const mappedSources = new Set<string>();
    const usedTargets = new Set<string>();

    // 3. Iterate through sorted pairs and create mappings for the best available matches first.
    for (const pair of allPairs) {
        if (!mappedSources.has(pair.source) && !usedTargets.has(pair.target)) {
            mapping[pair.source] = pair.target;
            mappedSources.add(pair.source);
            usedTargets.add(pair.target);
        }
    }

    // 4. Fallback for any source bones that didn't get mapped.
    for (const sourceName of sourceBoneNames) {
        if (!mappedSources.has(sourceName)) {
            // Prefer a 1:1 mapping if the target bone exists and is unused.
            if (targetBoneNames.has(sourceName) && !usedTargets.has(sourceName)) {
                mapping[sourceName] = sourceName;
                usedTargets.add(sourceName);
            } else {
                // Otherwise, map to self, even if it's a dead end. User can manually inspect and fix.
                mapping[sourceName] = sourceName;
            }
        }
    }
    
    return mapping;
}