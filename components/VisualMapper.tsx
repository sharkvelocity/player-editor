import React, { useRef, useEffect, useState } from 'react';
import type { BabylonInjectedContext } from '../types';

declare const BABYLON: any;

interface VisualMapperProps {
    babylonContext: BabylonInjectedContext;
    baseSkeleton: any | null; // BABYLON.Skeleton
    sourceSkeleton: any | null; // BABYLON.Skeleton
    baseMeshes: any[]; // BABYLON.AbstractMesh[]
    highlightedTargetBoneName: string | null;
    highlightedSourceBoneName: string | null;
    onClose: () => void;
}

const VisualMapper: React.FC<VisualMapperProps> = (props) => {
    const { babylonContext, baseSkeleton, sourceSkeleton, baseMeshes, highlightedTargetBoneName, highlightedSourceBoneName, onClose } = props;

    const leftCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightCanvasRef = useRef<HTMLCanvasElement>(null);
    const [syncCameras, setSyncCameras] = useState(true);

    // This effect handles the entire lifecycle of the Babylon.js views
    useEffect(() => {
        if (!leftCanvasRef.current || !rightCanvasRef.current || !baseSkeleton || !sourceSkeleton) {
            return;
        }

        const { engine, scene: mainScene } = babylonContext;
        const leftCanvas = leftCanvasRef.current;
        const rightCanvas = rightCanvasRef.current;

        // --- Layer Masks for isolating objects in each view ---
        const TARGET_LAYER = 0x1;
        const SOURCE_LAYER = 0x2;

        // --- Left View (Target Model) ---
        const leftCamera = new BABYLON.ArcRotateCamera("vm_cam_left", -Math.PI / 2, Math.PI / 2.5, 3, new BABYLON.Vector3(0, 1, 0), mainScene);
        leftCamera.layerMask = TARGET_LAYER;
        leftCamera.wheelDeltaPercentage = 0.01;
        const leftView = engine.registerView(leftCanvas, leftCamera);
        
        const playerMeshes = baseMeshes.filter(m => m.skeleton === baseSkeleton);
        playerMeshes.forEach(m => m.layerMask = TARGET_LAYER);
        
        // --- Right View (Source Skeleton) ---
        const rightCamera = new BABYLON.ArcRotateCamera("vm_cam_right", -Math.PI / 2, Math.PI / 2.5, 3, new BABYLON.Vector3(0, 1, 0), mainScene);
        rightCamera.layerMask = SOURCE_LAYER;
        rightCamera.wheelDeltaPercentage = 0.01;
        const rightView = engine.registerView(rightCanvas, rightCamera);
        
        const sourceSkeletonViewer = new BABYLON.SkeletonViewer(sourceSkeleton, null, mainScene, false, {
            displayMode: BABYLON.SkeletonViewer.DISPLAY_SPHERE_AND_SPURS
        });
        sourceSkeletonViewer.meshes.forEach(m => m.layerMask = SOURCE_LAYER);
        sourceSkeletonViewer.start();

        // --- Camera Syncing Logic ---
        let isSyncing = false; // Prevent infinite loops
        const syncLeftToRight = () => {
            if (!syncCameras || isSyncing) return;
            isSyncing = true;
            rightCamera.alpha = leftCamera.alpha;
            rightCamera.beta = leftCamera.beta;
            rightCamera.radius = leftCamera.radius;
            rightCamera.target.copyFrom(leftCamera.target);
            isSyncing = false;
        };
        const syncRightToLeft = () => {
            if (!syncCameras || isSyncing) return;
            isSyncing = true;
            leftCamera.alpha = rightCamera.alpha;
            leftCamera.beta = rightCamera.beta;
            leftCamera.radius = rightCamera.radius;
            leftCamera.target.copyFrom(rightCamera.target);
            isSyncing = false;
        };
        const leftObserver = leftCamera.onViewMatrixChangedObservable.add(syncLeftToRight);
        const rightObserver = rightCamera.onViewMatrixChangedObservable.add(syncRightToLeft);

        // --- Highlighters & Labels ---
        const createHighlighter = (name: string, layerMask: number) => {
            const hl = BABYLON.MeshBuilder.CreateSphere(name, { diameter: 0.08, segments: 12 }, mainScene);
            const mat = new BABYLON.StandardMaterial(`${name}_mat`, mainScene);
            mat.emissiveColor = BABYLON.Color3.White();
            mat.disableLighting = true;
            mat.wireframe = true;
            hl.material = mat;
            hl.layerMask = layerMask;
            hl.isPickable = false;
            
            // Pulsing effect
            const anim = new BABYLON.Animation("pulse", "scaling", 30, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
            anim.setKeys([
                { frame: 0, value: new BABYLON.Vector3(1, 1, 1) },
                { frame: 15, value: new BABYLON.Vector3(1.5, 1.5, 1.5) },
                { frame: 30, value: new BABYLON.Vector3(1, 1, 1) },
            ]);
            hl.animations.push(anim);
            mainScene.beginAnimation(hl, 0, 30, true);

            return hl;
        };
        
        const targetHl = createHighlighter("target_hl", TARGET_LAYER);
        const sourceHl = createHighlighter("source_hl", SOURCE_LAYER);

        const leftGui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("left_gui", true, mainScene);
        leftGui.layer.layerMask = TARGET_LAYER;
        const leftLabel = new BABYLON.GUI.TextBlock("left_label", "");
        leftLabel.color = "white";
        leftLabel.fontSize = 14;
        leftGui.addControl(leftLabel);

        const rightGui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("right_gui", true, mainScene);
        rightGui.layer.layerMask = SOURCE_LAYER;
        const rightLabel = new BABYLON.GUI.TextBlock("right_label", "");
        rightLabel.color = "white";
        rightLabel.fontSize = 14;
        rightGui.addControl(rightLabel);

        // --- Update Logic based on Props ---
        const updateHighlights = () => {
            const targetBone = baseSkeleton.bones.find((b: any) => b.name === highlightedTargetBoneName);
            const meshWithSkeleton = baseMeshes.find(m => m.skeleton === baseSkeleton);
            if (targetBone && meshWithSkeleton) {
                targetHl.attachToBone(targetBone, meshWithSkeleton);
                targetHl.setEnabled(true);
                leftLabel.text = targetBone.name;
                leftLabel.linkWithMesh(targetHl);
                leftLabel.linkOffsetY = "-30px";
            } else {
                targetHl.setEnabled(false);
                leftLabel.text = "";
            }

            const sourceBone = sourceSkeleton.bones.find((b: any) => b.name === highlightedSourceBoneName);
            if (sourceBone) {
                sourceHl.attachToBone(sourceBone, sourceSkeletonViewer.meshes[0]);
                sourceHl.setEnabled(true);
                rightLabel.text = sourceBone.name;
                rightLabel.linkWithMesh(sourceHl);
                rightLabel.linkOffsetY = "-30px";
            } else {
                sourceHl.setEnabled(false);
                rightLabel.text = "";
            }
        };

        updateHighlights();
        
        // This is a manual re-check because prop changes don't re-run the outer effect.
        // A more complex setup could use another effect, but this is simple and effective.
        const observer = mainScene.onBeforeRenderObservable.add(updateHighlights);
        
        // --- Cleanup ---
        return () => {
            mainScene.onBeforeRenderObservable.remove(observer);
            
            leftCamera.onViewMatrixChangedObservable.remove(leftObserver);
            rightCamera.onViewMatrixChangedObservable.remove(rightObserver);
            
            engine.unRegisterView(leftCanvas, leftCamera);
            engine.unRegisterView(rightCanvas, rightCamera);
            
            playerMeshes.forEach(m => m.layerMask = 0xFFFFFFFF); // Reset layer mask
            
            leftCamera.dispose();
            rightCamera.dispose();
            sourceSkeletonViewer.dispose();
            targetHl.dispose();
            sourceHl.dispose();
            leftGui.dispose();
            rightGui.dispose();
        };
    // Re-run effect only if skeletons change, not on every bone highlight
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseSkeleton, sourceSkeleton]);

    return (
        <div className="flex-shrink-0 p-2 mb-3 bg-slate-800/50 rounded-md border border-white/5 space-y-2">
            <div className="flex justify-between items-center">
                <div className="text-sm font-semibold text-cyan-200">Visual Bone Mapper</div>
                <div className="flex items-center gap-4">
                     <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                            type="checkbox"
                            checked={syncCameras}
                            onChange={() => setSyncCameras(s => !s)}
                            className="bg-slate-900"
                        />
                        Sync Cameras
                    </label>
                    <button onClick={onClose} className="text-red-400 font-bold px-2 hover:bg-red-400/10 rounded">✕</button>
                </div>
            </div>
            <div className="flex gap-2 h-64">
                <div className="w-1/2 h-full rounded-md overflow-hidden relative">
                    <canvas ref={leftCanvasRef} className="w-full h-full block" />
                    <div className="absolute top-1 left-2 text-xs text-white/50 font-semibold">TARGET (Player Model)</div>
                </div>
                <div className="w-1/2 h-full rounded-md overflow-hidden relative">
                    <canvas ref={rightCanvasRef} className="w-full h-full block" />
                    <div className="absolute top-1 left-2 text-xs text-white/50 font-semibold">SOURCE (Animation Skeleton)</div>
                </div>
            </div>
        </div>
    );
};

export default VisualMapper;
