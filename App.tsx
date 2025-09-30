import React, { useState, useRef, useCallback, useEffect } from 'react';
import BabylonCanvas from './components/BabylonCanvas';
import SidePanel from './components/SidePanel';
import type { BabylonInjectedContext, LogEntry, ImportedAnimFile, RetargetedAnimGroup, PlayerAction } from './types';
import { initialAnimationLinks } from './types';
import { appendModelToScene, exportGLB, retargetAnimationGroup } from './services/babylonService';
import { useLogger } from './hooks/useLogger';

// Add a global declaration for the BABYLON object to satisfy TypeScript
declare const BABYLON: any;

const playerModels = [
    { name: 'Default Player (HVGirl)', url: 'https://assets.babylonjs.com/meshes/HVGirl.glb' },
    { name: 'Dude', url: 'https://www.babylonjs-playground.com/scenes/dude.glb' },
    { name: 'Yeti', url: 'https://models.babylonjs.com/Yeti/glTF-Binary/Yeti.glb' },
    { name: 'Figure', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RiggedFigure/glTF-Binary/RiggedFigure.glb' },
    { name: 'Simple Rig', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RiggedSimple/glTF-Binary/RiggedSimple.glb' },
    { name: 'Vincent', url: 'https://models.babylonjs.com/Vincent.glb' },
];

const mapModels = [
    { name: 'Default Map (Mansion)', url: 'https://assets.babylonjs.com/meshes/Mansion/Mansion.glb' },
    { name: 'Courtyard', url: 'https://assets.babylonjs.com/meshes/country.glb' },
    { name: 'Espilit', url: 'https://assets.babylonjs.com/meshes/espilit.glb' },
    { name: 'Studio', url: 'https://www.babylonjs-playground.com/scenes/StudioScene.glb' },
    { name: 'Village', url: 'https://assets.babylonjs.com/meshes/village.glb' },
    { name: 'Facilities', url: 'https://models.babylonjs.com/Facilities/Facilities.glb' },
];

const App: React.FC = () => {
    const { logs, addLog } = useLogger();
    const babylonContext = useRef<BabylonInjectedContext | null>(null);

    const [baseMeshes, setBaseMeshes] = useState<any[]>([]); // BABYLON.AbstractMesh[]
    const [mapMeshes, setMapMeshes] = useState<any[]>([]); // BABYLON.AbstractMesh[]
    const [baseSkeleton, setBaseSkeleton] = useState<any | null>(null); // BABYLON.Skeleton | null
    const [importedAnimFiles, setImportedAnimFiles] = useState<ImportedAnimFile[]>([]);
    const [retargetedGroups, setRetargetedGroups] = useState<RetargetedAnimGroup[]>([]);
    const [selectedAnimations, setSelectedAnimations] = useState<Set<string>>(new Set());
    const [mappingTable, setMappingTable] = useState<Record<string, string>>({});
    const [spawnNode, setSpawnNode] = useState<any | null>(null); // BABYLON.TransformNode | null
    const [spawnCoords, setSpawnCoords] = useState<string>('(none)');
    const [sceneReady, setSceneReady] = useState(false);
    const [editorMode, setEditorMode] = useState<'editor' | 'test'>('editor');
    const [animationLinks, setAnimationLinks] = useState<Record<PlayerAction, string | null>>(initialAnimationLinks);
    const [headBoneName, setHeadBoneName] = useState<string | null>(null);
    const defaultModelsLoaded = useRef(false);

    const [mapRootNode, setMapRootNode] = useState<any | null>(null); // BABYLON.TransformNode
    const [mapScale, setMapScale] = useState(1);

    const handleSceneReady = (context: BabylonInjectedContext) => {
        babylonContext.current = context;
        addLog('Scene ready.');
        setSceneReady(true);
    };

    const loadBase = useCallback(async (fileOrUrl: File | string) => {
        if (!babylonContext.current) return;
        const scene = babylonContext.current.scene;
        const fileName = typeof fileOrUrl === 'string' ? fileOrUrl.split('/').pop() : fileOrUrl.name;
        addLog(`Loading base model: ${fileName}...`);
        
        baseMeshes.forEach(m => m.dispose());
        baseSkeleton?.dispose();
        
        const { newMeshes, newSkels, newAG } = await appendModelToScene(fileOrUrl, scene);
        const skeleton = newSkels[0] || newMeshes.find(m => m.skeleton)?.skeleton as any || null;
        
        setRetargetedGroups(currentGroups => {
            currentGroups.forEach(g => g.dispose());
            const baseAnimGroups: RetargetedAnimGroup[] = newAG.map(ag => {
                const metaGroup = ag as RetargetedAnimGroup;
                metaGroup.meta = { sourceFileName: '(base model)' };
                return metaGroup;
            });

            if (baseAnimGroups.length > 0) {
                addLog(`Found ${baseAnimGroups.length} animation(s) in base model.`);
                setSelectedAnimations(new Set(baseAnimGroups.map(g => g.name)));
            } else {
                setSelectedAnimations(new Set());
            }
            return baseAnimGroups;
        });

        // Set up player mesh for collisions in test mode
        newMeshes.forEach(m => {
            m.checkCollisions = true;
            // The ellipsoid is on the camera in test mode, not the mesh
        });
        setBaseMeshes(newMeshes);
        setBaseSkeleton(skeleton);
        
        if (skeleton) {
            addLog(`Base skeleton loaded: ${skeleton.name} (${skeleton.bones.length} bones)`);
            const initialMapping = skeleton.bones.reduce((acc: Record<string, string>, bone: any) => {
                acc[bone.name] = bone.name;
                return acc;
            }, {});
            setMappingTable(initialMapping);
            addLog('Generated default 1:1 bone mapping. You can now save it.');
            const head = skeleton.bones.find((b: any) => b.name.toLowerCase().includes('head'));
            if (head) {
                setHeadBoneName(head.name);
                addLog(`Auto-selected '${head.name}' as head bone.`);
            } else {
                setHeadBoneName(null);
            }
        } else {
            addLog('Warning: No skeleton found on base model.');
            setMappingTable({});
            setHeadBoneName(null);
        }

        if (newMeshes[0] && babylonContext.current.arcCam) {
            babylonContext.current.arcCam.target = newMeshes[0].getAbsolutePosition();
        }
    }, [addLog, baseMeshes, baseSkeleton, setMappingTable]);
    
    const loadMap = useCallback(async (fileOrUrl: File | string) => {
        if (!babylonContext.current) return;
        const scene = babylonContext.current.scene;
        const fileName = typeof fileOrUrl === 'string' ? fileOrUrl.split('/').pop() : fileOrUrl.name;
        addLog(`Loading map: ${fileName}...`);
        
        // Dispose of old map root and its children (the meshes)
        mapRootNode?.dispose(false, true);

        const root = new BABYLON.TransformNode(`MapRoot_${fileName}`, scene);
        setMapRootNode(root);
        setMapScale(1); // Reset scale on new map load

        const { newMeshes } = await appendModelToScene(fileOrUrl, scene, { makeCollidable: true });
        
        // Find the root nodes among the new meshes (those without a parent that is also in the new set)
        const newMeshesSet = new Set(newMeshes);
        const rootMeshes = newMeshes.filter((m: any) => !m.parent || !newMeshesSet.has(m.parent));

        rootMeshes.forEach((m: any) => {
            m.parent = root;
        });

        setMapMeshes(newMeshes); // Still store direct references for raycasting etc.
        addLog('Map loaded.');
    }, [addLog, mapRootNode]);

    useEffect(() => {
        if (sceneReady && !defaultModelsLoaded.current) {
            defaultModelsLoaded.current = true;
            addLog('Loading default models...');
            loadBase(playerModels[0].url);
            loadMap(mapModels[0].url);
        }
    }, [sceneReady, loadBase, loadMap, addLog]);

    const scanAndAddAnimations = useCallback(async (files: FileList) => {
        if (!babylonContext.current || !baseSkeleton) {
            addLog('Error: Load a base model with a skeleton first.');
            return;
        }
        const scene = babylonContext.current.scene;

        addLog(`Scanning ${files.length} animation file(s)...`);
        const newRetargetedGroups: RetargetedAnimGroup[] = [];

        for (const file of Array.from(files)) {
            const { newMeshes, newSkels, newAG } = await appendModelToScene(file, scene, { hideMeshes: true });
            const sourceSkeleton = newSkels[0];
            
            if (newAG && newAG.length > 0) {
                addLog(`Found ${newAG.length} animation(s) in ${file.name}. Retargeting...`);
                for (const sourceAnimGroup of newAG) {
                    const retargetedGroup = retargetAnimationGroup(sourceAnimGroup, baseSkeleton, mappingTable, scene);
                    retargetedGroup.name = `${file.name.replace(/\.[^/.]+$/, "")} | ${sourceAnimGroup.name}`;
                    
                    const metaGroup = retargetedGroup as RetargetedAnimGroup;
                    metaGroup.meta = { sourceFileName: file.name };
                    newRetargetedGroups.push(metaGroup);

                    addLog(`  - Retargeted ${sourceAnimGroup.name}`);
                }
            } else {
                addLog(`Warning: No animation groups found in ${file.name}`);
            }
            
            newMeshes.forEach((m: any) => m.dispose());
            sourceSkeleton?.dispose();
        }
        
        setRetargetedGroups(prev => [...prev, ...newRetargetedGroups]);
        setSelectedAnimations(prev => {
            const newSet = new Set(prev);
            newRetargetedGroups.forEach(g => newSet.add(g.name));
            return newSet;
        });
    }, [addLog, baseSkeleton, mappingTable]);

    const handleExport = useCallback(async () => {
        if (!babylonContext.current || baseMeshes.length === 0) {
            addLog('Error: No base mesh loaded to export.');
            return;
        }
        addLog('Exporting Player GLB...');
        const nodesToExport: any[] = [...baseMeshes];
        if (spawnNode) nodesToExport.push(spawnNode);
    
        let headCam: any = null; // BABYLON.Camera
        if (headBoneName && baseSkeleton) {
            const headBone = baseSkeleton.bones.find((b: any) => b.name === headBoneName);
            if (headBone) {
                headCam = new BABYLON.FreeCamera("PlayerHeadCamera", BABYLON.Vector3.Zero(), babylonContext.current.scene);
                headCam.parent = headBone; // Attach camera to the bone
                nodesToExport.push(headCam);
                addLog(`Adding camera to head bone '${headBoneName}' for export.`);
            } else {
                addLog(`Warning: Could not find head bone '${headBoneName}' to attach camera.`);
            }
        }

        const animationGroupsForExport: any[] = [];
        const tempGroupsToDispose: any[] = [];
        
        const linkedAnimsMap = new Map<string, string>(); // Map from original name to new action name
        for (const [action, animName] of Object.entries(animationLinks)) {
            if (animName) {
                linkedAnimsMap.set(animName, action.toLowerCase());
            }
        }
    
        const allNamesToExport = new Set([...selectedAnimations, ...linkedAnimsMap.keys()]);
        addLog(`Preparing ${allNamesToExport.size} unique animation(s) for export...`);
    
        for (const animName of allNamesToExport) {
            const originalGroup = retargetedGroups.find(g => g.name === animName);
            if (!originalGroup) continue;
    
            if (linkedAnimsMap.has(animName)) {
                const newName = linkedAnimsMap.get(animName)!;
                const newGroup = new BABYLON.AnimationGroup(newName, babylonContext.current.scene);
                originalGroup.targetedAnimations.forEach((ta: any) => newGroup.addTargetedAnimation(ta.animation, ta.target));
                newGroup.normalize(originalGroup.from, originalGroup.to);
                
                animationGroupsForExport.push(newGroup);
                tempGroupsToDispose.push(newGroup);
                addLog(`Including and renaming '${animName}' to '${newName}'.`);
            } else {
                animationGroupsForExport.push(originalGroup);
                addLog(`Including selected animation '${animName}'.`);
            }
        }
    
        try {
            await exportGLB(babylonContext.current.scene, nodesToExport, animationGroupsForExport, 'exported_player.glb');
            addLog('Player GLB export initiated.');
        } finally {
            tempGroupsToDispose.forEach(g => g.dispose());
            headCam?.dispose();
        }
    }, [addLog, baseMeshes, retargetedGroups, spawnNode, animationLinks, selectedAnimations, headBoneName, baseSkeleton]);
    
    const handleExportMap = useCallback(async () => {
        if (!babylonContext.current || !mapRootNode) {
            addLog('Error: No map loaded to export.');
            return;
        }
        addLog('Exporting Map GLB...');
        const nodesToExport: any[] = [mapRootNode];
        if (spawnNode) {
            nodesToExport.push(spawnNode);
            addLog('Including spawn point in map export.');
        }

        await exportGLB(babylonContext.current.scene, nodesToExport, [], 'exported_map.glb');
        addLog('Map GLB export initiated.');
    }, [addLog, mapRootNode, spawnNode]);

    const handleApplyMapScale = useCallback(() => {
        if (mapRootNode) {
            mapRootNode.scaling.setAll(mapScale);
            addLog(`Map scale applied: ${mapScale}`);
        } else {
            addLog('Error: No map loaded to scale.');
        }
    }, [addLog, mapRootNode, mapScale]);

    const handleSaveSpawnNode = useCallback(() => {
        if (!babylonContext.current) return;
        const { scene, devCam } = babylonContext.current;
        if (!devCam || scene.activeCamera?.name !== 'devCam') {
            addLog('Error: Activate Dev Cam to set spawn point.');
            return;
        }

        const ray = devCam.getForwardRay();
        const pickInfo = scene.pickWithRay(ray, (mesh: any) => mapMeshes.includes(mesh));

        if (pickInfo && pickInfo.hit) {
            let node = spawnNode;
            if (!node) {
                node = new BABYLON.TransformNode("SpawnPoint", scene);
                setSpawnNode(node);
            }
            node.position = pickInfo.pickedPoint.clone();
            node.rotation = devCam.rotation.clone();
            node.rotation.x = 0;
            node.rotation.z = 0;

            const pos = node.position;
            const coordsStr = `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
            setSpawnCoords(coordsStr);
            addLog(`Spawn point saved at ${coordsStr}`);
        } else {
            addLog('Error: Aim at the map to set a spawn point. No surface found.');
        }
    }, [addLog, spawnNode, mapMeshes]);

    const toggleDevCam = useCallback(() => {
        if (!babylonContext.current) return;
        const { scene, arcCam, devCam, canvas } = babylonContext.current;
        if (!arcCam || !devCam) return;
    
        if (scene.activeCamera?.name === 'arcCam') {
            devCam.position = arcCam.position.clone();
            devCam.setTarget(arcCam.target.clone());
            
            devCam.applyGravity = false;
            devCam.checkCollisions = false;
            devCam.inertia = 0;
            devCam.speed = 4;
            devCam.keysUp = [87]; // W
            devCam.keysDown = [83]; // S
            devCam.keysLeft = [65]; // A
            devCam.keysRight = [68]; // D
    
            scene.activeCamera.detachControl();
            scene.activeCamera = devCam;
            scene.activeCamera.attachControl(canvas, true);
            addLog('Dev Cam enabled (Fly Mode).');
        } else { // Switching from devCam back to arcCam
            arcCam.position = devCam.position.clone();
            const playerRoot = baseMeshes.find(m => m.skeleton === baseSkeleton) || baseMeshes[0];
            if (playerRoot) {
                // Re-target the arc camera to the player model for a consistent experience
                arcCam.setTarget(playerRoot.getAbsolutePosition());
            } else {
                // Fallback to old behavior if no player mesh is found
                arcCam.setTarget(devCam.target.clone());
            }
    
            scene.activeCamera.detachControl();
            
            // Reset devCam properties for when it's used for testing
            devCam.applyGravity = true;
            devCam.checkCollisions = true;
            devCam.inertia = 0.9;
            devCam.speed = 2;
            devCam.keysUp = [];
            devCam.keysDown = [];
            devCam.keysLeft = [];
            devCam.keysRight = [];
    
            scene.activeCamera = arcCam;
            scene.activeCamera.attachControl(canvas, true);
            addLog('Arc Rotate Cam enabled.');
        }
    }, [addLog, baseMeshes, baseSkeleton]);

    const handleToggleTestMode = () => setEditorMode(mode => mode === 'editor' ? 'test' : 'editor');

    useEffect(() => {
        if (!babylonContext.current || baseMeshes.length === 0) return;
        const { scene, devCam, canvas } = babylonContext.current;
        
        if (editorMode !== 'test') {
            return;
        }

        if (!headBoneName) {
            addLog('Error: Please select a head bone for first-person test mode.');
            setEditorMode('editor');
            return;
        }
        const headBone = baseSkeleton?.bones.find((b: any) => b.name === headBoneName);
        if (!headBone) {
            addLog(`Error: Could not find selected head bone "${headBoneName}".`);
            setEditorMode('editor');
            return;
        }

        addLog('Entering test mode...');
        const playerRoot = baseMeshes.find(m => m.skeleton === baseSkeleton) || baseMeshes[0];
        
        // Position the camera at the spawn point before starting.
        const startPosition = spawnNode ? spawnNode.getAbsolutePosition() : new BABYLON.Vector3(0, 2, 0);
        startPosition.y += 0.1; // Raise spawn point slightly to prevent getting stuck in floor
        const startRotation = spawnNode ? spawnNode.rotation.clone() : new BABYLON.Vector3(0, Math.PI, 0); // Default to facing forward

        devCam.position.copyFrom(startPosition);
        devCam.rotation.copyFrom(startRotation);

        if (!spawnNode) {
            addLog('Warning: No spawn point set. Starting at world origin.');
        }

        const originalMinZ = devCam.minZ;
        const previousCamera = scene.activeCamera;
        scene.activeCamera.detachControl();
        scene.activeCamera = devCam;
        devCam.attachControl(canvas, true);

        devCam.keysUp = [87]; devCam.keysDown = [83]; devCam.keysLeft = [65]; devCam.keysRight = [68];
        devCam.inertia = 0.9;
        devCam.angularSensibility = 500;
        
        const inputMap: Record<string, boolean> = {};
        const onKeyDown = (e: KeyboardEvent) => { inputMap[e.key.toLowerCase()] = true; };
        const onKeyUp = (e: KeyboardEvent) => { inputMap[e.key.toLowerCase()] = false; };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        
        let playerState: 'standing' | 'crouching' | 'to_crouch' | 'to_stand' = 'standing';
        let currentAnim: any | null = null;
        let lastRotationY = devCam.rotation.y;
        const rotationThreshold = 0.005;
        let cWasDown = false;
        let capsulePosition: any | null = null; // BABYLON.Vector3

        const getAnim = (name: string | null): any | null => name ? retargetedGroups.find(ag => ag.name === name) || null : null;
        
        const playAnimLoop = (animName: string | null) => {
            const animGroup = getAnim(animName) || getAnim(animationLinks.idle);
            if (animGroup && animGroup !== currentAnim) {
                currentAnim?.stop();
                animGroup.play(true);
                currentAnim = animGroup;
            }
        };
        
        const playAnimOnce = (animName: string | null, onEnd: () => void) => {
            const animGroup = getAnim(animName);
            if (animGroup) {
                if (animGroup !== currentAnim) {
                    currentAnim?.stop();
                    animGroup.play(false);
                    currentAnim = animGroup;
                    currentAnim.onAnimationGroupEndObservable.addOnce(onEnd);
                }
            } else {
                onEnd();
            }
        };

        const FALL_Y_THRESHOLD = -20;
        
        const beforeObserver = scene.onBeforeRenderObservable.add(() => {
            const isMovingForward = !!inputMap['w'];
            const isMovingBackward = !!inputMap['s'];
            const isStrafingLeft = !!inputMap['a'];
            const isStrafingRight = !!inputMap['d'];
            const isMoving = isMovingForward || isMovingBackward || isStrafingLeft || isStrafingRight;
            const isSprinting = !!inputMap['shift'];
            const cIsDown = !!inputMap['c'];

            const deltaRotationY = devCam.rotation.y - lastRotationY;
            const isTurningLeft = deltaRotationY > rotationThreshold;
            const isTurningRight = deltaRotationY < -rotationThreshold;

            if (cIsDown && !cWasDown) {
                if (playerState === 'standing') playerState = 'to_crouch';
                else if (playerState === 'crouching') playerState = 'to_stand';
            }
            cWasDown = cIsDown;
            
            const isCrouched = playerState === 'crouching' || playerState === 'to_crouch';
            devCam.speed = isCrouched ? 2 : (isSprinting && isMovingForward ? 8 : 4);
            const targetEllipsoidHeight = isCrouched ? 0.5 : 1;
            devCam.ellipsoid.y = BABYLON.Scalar.Lerp(devCam.ellipsoid.y, targetEllipsoidHeight, 0.1);

            switch (playerState) {
                case 'standing':
                    if (isSprinting && isMovingForward) playAnimLoop(animationLinks.run);
                    else if (isMovingForward || isMovingBackward) playAnimLoop(animationLinks.walk);
                    else if (isStrafingLeft) playAnimLoop(animationLinks.strafeLeft);
                    else if (isStrafingRight) playAnimLoop(animationLinks.strafeRight);
                    else if (isTurningLeft) playAnimLoop(animationLinks.turnLeft);
                    else if (isTurningRight) playAnimLoop(animationLinks.turnRight);
                    else playAnimLoop(animationLinks.idle);
                    break;
                case 'crouching':
                    if (isMoving) playAnimLoop(animationLinks.crouchWalk);
                    else playAnimLoop(animationLinks.crouchIdle);
                    break;
                case 'to_crouch':
                    playAnimOnce(animationLinks.standingToCrouch, () => {
                        if (playerState === 'to_crouch') playerState = 'crouching';
                    });
                    break;
                case 'to_stand':
                    playAnimOnce(animationLinks.crouchToStanding, () => {
                        if (playerState === 'to_stand') playerState = 'standing';
                    });
                    break;
            }
            lastRotationY = devCam.rotation.y;

            if (devCam.position.y < FALL_Y_THRESHOLD) {
                const respawnPosition = spawnNode
                    ? spawnNode.position.clone()
                    : new BABYLON.Vector3(0, 5, 0);
                devCam.position.copyFrom(respawnPosition);
                addLog('Fell off map, respawning...');
            }

            playerRoot.position.copyFrom(devCam.position);
            playerRoot.position.y -= devCam.ellipsoid.y;
            playerRoot.rotationQuaternion = null;
            playerRoot.rotation.y = devCam.rotation.y;

            playerRoot.computeWorldMatrix(true);

            capsulePosition = devCam.position.clone();
            
            const headBoneMatrix = headBone.getAbsoluteMatrix();
            const eyeOffset = new BABYLON.Vector3(0, 0.1, 0.15); // 10cm up, 15cm forward
            const worldEyePosition = BABYLON.Vector3.TransformCoordinates(eyeOffset, headBoneMatrix);
            devCam.position.copyFrom(worldEyePosition);
        });

        const afterObserver = scene.onAfterRenderObservable.add(() => {
            if (capsulePosition) {
                devCam.position.copyFrom(capsulePosition);
                capsulePosition = null;
            }
        });

        return () => {
            addLog('Exiting test mode...');
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            scene.onBeforeRenderObservable.remove(beforeObserver);
            scene.onAfterRenderObservable.remove(afterObserver);
            currentAnim?.stop();
            devCam.minZ = originalMinZ; // Restore near clip plane
            devCam.ellipsoid.y = 1;
            devCam.keysUp = []; devCam.keysDown = []; devCam.keysLeft = []; devCam.keysRight = [];
            devCam.detachControl();

            // Restore the editor camera to a predictable state, looking at the player.
            if (previousCamera && playerRoot) {
                const playerPosition = playerRoot.getAbsolutePosition();
                const playerMidPoint = playerPosition.add(new BABYLON.Vector3(0, 1, 0));

                if (previousCamera.name === 'arcCam') {
                    const arcCam = previousCamera as any; // BABYLON.ArcRotateCamera
                    arcCam.target = playerMidPoint;
                    arcCam.alpha = -playerRoot.rotation.y - (Math.PI / 2);
                    arcCam.beta = Math.PI / 3; // 60 degrees from vertical
                    arcCam.radius = 4;
                } else if (previousCamera.name === 'devCam') {
                    const forwardVector = playerRoot.getDirection(new BABYLON.Vector3(0, 0, 1));
                    const cameraPosition = playerPosition
                        .subtract(forwardVector.scale(4)) // 4 units behind
                        .add(new BABYLON.Vector3(0, 2, 0)); // 2 units up
                    previousCamera.position = cameraPosition;
                    previousCamera.setTarget(playerMidPoint);
                }
            }

            scene.activeCamera = previousCamera;
            scene.activeCamera.attachControl(canvas, true);
        };

    }, [editorMode, baseMeshes, addLog, retargetedGroups, animationLinks, baseSkeleton, headBoneName, spawnNode]);

    return (
        <div className="flex w-screen h-screen bg-slate-900">
            <SidePanel
                logs={logs}
                onLoadBase={loadBase}
                onLoadMap={loadMap}
                onScanAnimations={scanAndAddAnimations}
                baseSkeleton={baseSkeleton}
                retargetedGroups={retargetedGroups}
                setRetargetedGroups={setRetargetedGroups}
                selectedAnimations={selectedAnimations}
                setSelectedAnimations={setSelectedAnimations}
                mappingTable={mappingTable}
                setMappingTable={setMappingTable}
                onExport={handleExport}
                onSaveSpawnNode={handleSaveSpawnNode}
                onToggleDevCam={toggleDevCam}
                spawnCoords={spawnCoords}
                baseMeshes={baseMeshes}
                addLog={addLog}
                playerModels={playerModels}
                mapModels={mapModels}
                editorMode={editorMode}
                onToggleTestMode={handleToggleTestMode}
                animationLinks={animationLinks}
                setAnimationLinks={setAnimationLinks}
                headBoneName={headBoneName}
                setHeadBoneName={setHeadBoneName}
                onExportMap={handleExportMap}
                mapScale={mapScale}
                setMapScale={setMapScale}
                onApplyMapScale={handleApplyMapScale}
            />
            <div className="flex-1 p-3 pl-0">
                <div className="w-full h-full rounded-md overflow-hidden shadow-2xl shadow-black/50">
                    <BabylonCanvas onSceneReady={handleSceneReady} />
                </div>
            </div>
        </div>
    );
};

export default App;