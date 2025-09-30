import React, { useRef, useEffect } from 'react';
import type { BabylonInjectedContext } from '../types';

interface BabylonCanvasProps {
    onSceneReady: (context: BabylonInjectedContext) => void;
}

const BabylonCanvas: React.FC<BabylonCanvasProps> = ({ onSceneReady }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        
        // FIX: Access Babylon.js via the global window object to avoid module conflicts.
        const BABYLON = (window as any).BABYLON;
        if (!BABYLON) {
            console.error("Babylon.js not found on global scope. Check script tags in index.html.");
            return;
        }

        const canvas = canvasRef.current;
        const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.08, 1);

        // --- Physics and World Setup ---
        scene.gravity = new BABYLON.Vector3(0, -9.81, 0);
        scene.collisionsEnabled = true;

        // This creates a default environment including an HDR texture for realistic PBR lighting.
        scene.createDefaultEnvironment({
            createGround: false,
            createSkybox: true,
            skyboxSize: 150,
        });

        // --- Cameras ---
        const arcCam = new BABYLON.ArcRotateCamera("arcCam", Math.PI / 2, Math.PI / 3, 4, new BABYLON.Vector3(0, 1.5, 0), scene);
        arcCam.attachControl(canvas, true);
        arcCam.wheelDeltaPercentage = 0.01;
        arcCam.minZ = 0.1;

        const devCam = new BABYLON.FreeCamera("devCam", new BABYLON.Vector3(0, 2, -5), scene);
        devCam.minZ = 0.1;
        devCam.checkCollisions = true;
        devCam.applyGravity = true;
        devCam.ellipsoid = new BABYLON.Vector3(0.5, 1, 0.5); // Player-like collision box
        devCam.speed = 2; // A better default speed for walking
        
        scene.activeCamera = arcCam;
        
        // --- Ground ---
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
        const groundMat = new BABYLON.StandardMaterial("gmat", scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.03, 0.04, 0.05);
        ground.material = groundMat;
        ground.checkCollisions = true;

        engine.runRenderLoop(() => {
            scene.render();
        });

        const handleResize = () => engine.resize();
        window.addEventListener('resize', handleResize);

        onSceneReady({ engine, scene, canvas, arcCam, devCam });
        
        return () => {
            window.removeEventListener('resize', handleResize);
            engine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <canvas ref={canvasRef} className="w-full h-full block" />;
};

export default BabylonCanvas;