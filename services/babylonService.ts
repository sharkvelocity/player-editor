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