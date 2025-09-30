import React, { useState, useCallback, ChangeEvent, useMemo } from 'react';
import type { LogEntry, PlayerAction, RetargetedAnimGroup } from '../types';
import { playerActions } from '../types';

// Add a global declaration for the BABYLON object to satisfy TypeScript
declare const BABYLON: any;

// UI Sub-components
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="my-2.5 p-2 bg-slate-800/50 rounded-md border border-white/5">
        <h2 className="mb-2 text-sm font-semibold text-cyan-200">{title}</h2>
        {children}
    </div>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' }> = ({ children, className, variant = 'primary', ...props }) => {
    const baseClasses = "px-2.5 py-2 text-left w-full rounded cursor-pointer transition-colors duration-150 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
    const variantClasses = {
        primary: "bg-transparent text-cyan-400 border border-cyan-400/20 hover:bg-cyan-400/10",
        danger: "bg-transparent text-red-400 border border-red-400/20 hover:bg-red-400/10",
    };
    return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
};

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...props }) => (
    <select className="w-full p-1.5 rounded bg-slate-950 border border-white/10 text-cyan-200 text-sm" {...props}>{children}</select>
);

const FileInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input type="file" className="block w-full text-xs text-cyan-200 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-cyan-400/10 file:text-cyan-300 hover:file:bg-cyan-400/20" {...props} />
);

const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
    <label htmlFor={htmlFor} className="block text-sm my-2 mb-1 capitalize">{children}</label>
);

const prettyActionNames: Record<PlayerAction, string> = {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    strafeLeft: 'Strafe Left',
    strafeRight: 'Strafe Right',
    turnLeft: 'Turn Left (In Place)',
    turnRight: 'Turn Right (In Place)',
    crouchIdle: 'Crouch - Idle',
    crouchWalk: 'Crouch - Walk',
    standingToCrouch: 'Transition: Stand to Crouch',
    crouchToStanding: 'Transition: Crouch to Stand',
};

const actionGroups = {
    "Standing": ['idle', 'walk', 'run', 'strafeLeft', 'strafeRight', 'turnLeft', 'turnRight'],
    "Crouching": ['crouchIdle', 'crouchWalk'],
    "Transitions": ['standingToCrouch', 'crouchToStanding'],
};

interface SidePanelProps {
    logs: LogEntry[];
    onLoadBase: (fileOrUrl: File | string) => void;
    onLoadMap: (fileOrUrl: File | string) => void;
    onScanAnimations: (files: FileList) => void;
    baseSkeleton: any | null; // BABYLON.Skeleton
    retargetedGroups: RetargetedAnimGroup[];
    setRetargetedGroups: React.Dispatch<React.SetStateAction<RetargetedAnimGroup[]>>;
    selectedAnimations: Set<string>;
    setSelectedAnimations: React.Dispatch<React.SetStateAction<Set<string>>>;
    mappingTable: Record<string, string>;
    setMappingTable: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    onExport: () => void;
    onSaveSpawnNode: () => void;
    onToggleDevCam: () => void;
    spawnCoords: string;
    baseMeshes: any[]; // BABYLON.AbstractMesh[]
    addLog: (message: string) => void;
    playerModels: { name: string; url: string; }[];
    mapModels: { name: string; url: string; }[];
    editorMode: 'editor' | 'test';
    onToggleTestMode: () => void;
    animationLinks: Record<PlayerAction, string | null>;
    setAnimationLinks: React.Dispatch<React.SetStateAction<Record<PlayerAction, string | null>>>;
    headBoneName: string | null;
    setHeadBoneName: React.Dispatch<React.SetStateAction<string | null>>;
    onExportMap: () => void;
    mapScale: number;
    setMapScale: React.Dispatch<React.SetStateAction<number>>;
    onApplyMapScale: () => void;
    sourceBoneNames: string[] | null;
    onAutoMapBones: () => void;
    highlightedBone: string | null;
    onSelectBoneForMapping: (sourceBoneName: string, targetBoneName: string) => void;
}

const SidePanel: React.FC<SidePanelProps> = (props) => {
    const { logs, onLoadBase, onLoadMap, onScanAnimations, baseSkeleton, retargetedGroups, setRetargetedGroups, selectedAnimations, setSelectedAnimations, onExport, onSaveSpawnNode, onToggleDevCam, spawnCoords, baseMeshes, addLog, setMappingTable, mappingTable, playerModels, mapModels, editorMode, onToggleTestMode, animationLinks, setAnimationLinks, headBoneName, setHeadBoneName, onExportMap, mapScale, setMapScale, onApplyMapScale, sourceBoneNames, onAutoMapBones, highlightedBone, onSelectBoneForMapping } = props;

    const [boneSearch, setBoneSearch] = useState('');
    const [mappingSearch, setMappingSearch] = useState('');
    const [playerScale, setPlayerScale] = useState(1);

    const { baseAnimations, fileAnimations } = useMemo(() => {
        const baseAnims = retargetedGroups.filter(g => g.meta.sourceFileName === '(base model)');
        const fileAnims = retargetedGroups.filter(g => g.meta.sourceFileName !== '(base model)');
        return { baseAnimations: baseAnims, fileAnimations: fileAnims };
    }, [retargetedGroups]);

    const handleBaseFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) onLoadBase(e.target.files[0]);
    };
    const handleMapFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) onLoadMap(e.target.files[0]);
    };
    const handleAnimFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) onScanAnimations(e.target.files);
    };

    const handleLoadMapping = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    setMappingTable(json);
                    addLog(`Loaded mapping from ${file.name}`);
                } catch (err) {
                    addLog(`Error parsing mapping JSON: ${err}`);
                }
            };
            reader.readAsText(file);
        }
    };
    
    const handleSaveMapping = () => {
        const data = JSON.stringify(mappingTable, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bone-mapping.json';
        a.click();
        URL.revokeObjectURL(url);
        addLog('Bone mapping saved.');
    };

    const handleApplyPlayerScale = () => {
        baseMeshes.forEach(m => m.scaling.setAll(playerScale));
        addLog(`Player scale applied: ${playerScale}`);
    };
    
    const filteredBones = useMemo(() => {
        if (!baseSkeleton) return [];
        return baseSkeleton.bones.filter((bone: any) => bone.name.toLowerCase().includes(boneSearch.toLowerCase()));
    }, [baseSkeleton, boneSearch]);

    const filteredMapping = useMemo(() => {
        if (!mappingTable) return [];
        const searchTerm = mappingSearch.toLowerCase();
        return Object.entries(mappingTable).filter(([source, target]) =>
            source.toLowerCase().includes(searchTerm) ||
            (target && target.toLowerCase().includes(searchTerm))
        ).sort((a, b) => a[0].localeCompare(b[0]));
    }, [mappingTable, mappingSearch]);

    const targetBoneOptions = useMemo(() => {
        if (!baseSkeleton) return [];
        const sortedBones = [...baseSkeleton.bones].sort((a: any, b: any) => a.name.localeCompare(b.name));
        return [
            <option key="unmapped" value="">-- Unmapped --</option>,
            ...sortedBones.map((bone: any) => (
                <option key={bone.id} value={bone.name}>{bone.name}</option>
            ))
        ];
    }, [baseSkeleton]);
    
    const handleMappingChange = useCallback((sourceBone: string, newTargetBone: string) => {
        setMappingTable(prev => ({
            ...prev,
            [sourceBone]: newTargetBone,
        }));
    }, [setMappingTable]);

    const playAnim = (animGroup: any) => {
        if (!animGroup || animGroup.targetedAnimations.length === 0) {
            addLog(`Cannot play "${animGroup.name}": animation is empty, check bone mapping.`);
            return;
        }
        
        // Stop any other animations that might be playing.
        retargetedGroups.forEach(ag => {
            if (ag.isPlaying && ag !== animGroup) {
                ag.stop();
            }
        });

        // Always restart the animation from the beginning on loop.
        // This provides consistent behavior for the play button.
        animGroup.stop();
        animGroup.play(true);
    };
    const pauseAnim = (animGroup: any) => animGroup.pause();
    const stopAnim = (animGroup: any) => animGroup.stop();

    const playSelected = () => {
        retargetedGroups.forEach(ag => ag.stop());
        retargetedGroups.forEach(ag => {
            if (selectedAnimations.has(ag.name)) {
                ag.play(true);
            }
        });
    };
    const stopSelected = () => {
        retargetedGroups.forEach(ag => {
            if (selectedAnimations.has(ag.name)) {
                ag.stop();
            }
        });
    };

    const pruneUnselected = () => {
        const keptGroups = retargetedGroups.filter(g => selectedAnimations.has(g.name));
        const removedGroups = retargetedGroups.filter(g => !selectedAnimations.has(g.name));
        const removedCount = removedGroups.length;

        removedGroups.forEach(g => g.dispose());
        setRetargetedGroups(keptGroups);
        addLog(`Pruned ${removedCount} unselected animation(s).`);
    };

    const handleLinkChange = (action: PlayerAction, animName: string) => {
        setAnimationLinks(prev => ({ ...prev, [action]: animName === 'null' ? null : animName }));
    };

    const handleToggleSelection = (animName: string) => {
        setSelectedAnimations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(animName)) {
                newSet.delete(animName);
            } else {
                newSet.add(animName);
            }
            return newSet;
        });
    };

    const renderLinkDropdown = (action: PlayerAction) => (
        <div key={action} className="mb-1.5">
            <Label htmlFor={`link-${action}`}>{prettyActionNames[action]}</Label>
            <Select 
                id={`link-${action}`}
                value={animationLinks[action] || 'null'} 
                onChange={(e) => handleLinkChange(action, e.target.value)}
            >
                <option value="null">-- None --</option>
                {baseAnimations.map(ag => (
                    <option key={ag.name} value={ag.name}>{ag.name}</option>
                ))}
                {fileAnimations.length > 0 && baseAnimations.length > 0 && (
                    <option disabled>──────────</option>
                )}
                {fileAnimations.map(ag => (
                    <option key={ag.name} value={ag.name}>{ag.name}</option>
                ))}
            </Select>
        </div>
    );

    const renderAnimationList = (animations: RetargetedAnimGroup[]) => (
        <div className="max-h-40 overflow-auto p-1.5 border border-dashed border-cyan-400/10 rounded-md text-xs">
            {animations.map((ag, index) => {
                const isSelected = selectedAnimations.has(ag.name);
                return (
                    <div 
                        key={index} 
                        className={`flex justify-between items-center p-1.5 my-1 rounded cursor-pointer transition-colors ${isSelected ? 'bg-cyan-400/20' : 'bg-black/20 hover:bg-black/40'}`}
                        onClick={() => handleToggleSelection(ag.name)}
                    >
                        <span className="text-cyan-200 truncate pr-2">{ag.name}</span>
                        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                            <button onClick={() => playAnim(ag)} className="text-green-400 hover:text-green-300 text-base">▶</button>
                            <button onClick={() => pauseAnim(ag)} className="text-yellow-400 hover:text-yellow-300 text-base">❚❚</button>
                            <button onClick={() => stopAnim(ag)} className="text-red-400 hover:text-red-300 text-base">■</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="w-[380px] h-full bg-gradient-to-b from-slate-950 to-gray-950 p-3.5 border-r border-cyan-400/10 overflow-y-auto">
            <h1 className="text-lg font-bold text-cyan-400 mb-2.5">PhasmaPhoney 3D Editor</h1>

            <Section title="Files / Defaults">
                <Label>Player Model</Label>
                <Select onChange={(e) => onLoadBase(e.target.value)} defaultValue={playerModels[0].url}>
                    {playerModels.map((model) => (
                        <option key={model.url} value={model.url}>
                           {model.name}
                        </option>
                    ))}
                </Select>
                <FileInput onChange={handleBaseFileChange} accept=".glb,.gltf" />
                
                <Label>Map / Level</Label>
                <Select onChange={(e) => onLoadMap(e.target.value)} defaultValue={mapModels[0].url}>
                    {mapModels.map((model) => (
                        <option key={model.url} value={model.url}>
                           {model.name}
                        </option>
                    ))}
                </Select>
                <FileInput onChange={handleMapFileChange} accept=".glb,.gltf" />

                <Label>Animation GLB(s)</Label>
                <FileInput onChange={handleAnimFilesChange} accept=".glb,.gltf" multiple />
            </Section>

            <Section title="Player Controls">
                <Label>Player Scale</Label>
                <div className="flex gap-2">
                    <input
                        type="number"
                        step="0.1"
                        value={playerScale}
                        onChange={(e) => setPlayerScale(parseFloat(e.target.value) || 1)}
                        className="w-full p-1.5 rounded bg-slate-950 border border-white/10 text-cyan-200 text-sm"
                    />
                    <Button onClick={handleApplyPlayerScale}>Apply</Button>
                </div>
            </Section>
            
            <Section title="Map Tools">
                <Label>Map Scale</Label>
                <div className="flex gap-2">
                    <input
                        type="number"
                        step="0.1"
                        value={mapScale}
                        onChange={(e) => setMapScale(parseFloat(e.target.value) || 1)}
                        className="w-full p-1.5 rounded bg-slate-950 border border-white/10 text-cyan-200 text-sm"
                    />
                    <Button onClick={onApplyMapScale}>Apply</Button>
                </div>
            </Section>

            <Section title="Bones (Base)">
                <input
                    className="w-full p-1.5 rounded bg-slate-950 border border-white/10 text-cyan-200 text-sm mb-2"
                    placeholder="Search bones..."
                    value={boneSearch}
                    onChange={(e) => setBoneSearch(e.target.value)}
                />
                <div className="max-h-40 overflow-auto p-1.5 border border-dashed border-cyan-400/10 rounded-md text-xs text-cyan-300">
                    {baseSkeleton ? filteredBones.map((bone: any) => <div key={bone.id}>{bone.name}</div>) : 'No skeleton loaded.'}
                </div>
            </Section>
            
            <Section title="Animations (from Base Model)">
                {renderAnimationList(baseAnimations)}
            </Section>

            <Section title="Animations From File">
                {renderAnimationList(fileAnimations)}
                {fileAnimations.length === 0 && <p className="text-xs text-cyan-300/60 p-1">Load animation GLBs to see them here.</p>}
            </Section>

            <Section title="Animation Controls">
                <div className="flex gap-2">
                    <Button onClick={playSelected}>Play Selected</Button>
                    <Button onClick={stopSelected}>Stop Selected</Button>
                </div>
                 <div className="flex gap-2 mt-2">
                    <Button onClick={pruneUnselected} variant="danger">Prune Unselected</Button>
                </div>
            </Section>

            <Section title="Animation Links">
                {baseSkeleton ? (
                    <>
                        {Object.entries(actionGroups).map(([groupName, actions]) => (
                             <div key={groupName}>
                                <h3 className="text-xs font-bold uppercase text-cyan-300/70 mt-2 mb-1">{groupName}</h3>
                                {actions.map(action => renderLinkDropdown(action as PlayerAction))}
                            </div>
                        ))}
                    </>
                ) : <p className="text-xs text-cyan-300/80">Load a player model with a skeleton to link animations.</p>}
            </Section>

            <Section title="Export">
                <div className="space-y-2">
                    <Button onClick={onExport}>Export Player GLB</Button>
                    <Button onClick={onExportMap}>Export Map GLB (with Spawns)</Button>
                </div>
            </Section>
            
             <Section title="Remapper & Mappings">
                <div className="flex gap-2">
                    <Button
                        onClick={onAutoMapBones}
                        disabled={!baseSkeleton || !sourceBoneNames}
                        title={!baseSkeleton || !sourceBoneNames ? "Load a base model and an animation file first" : "Guess bone mapping based on keywords"}
                    >
                        Auto-Map Bones
                    </Button>
                    <Button onClick={handleSaveMapping}>Save Mapping</Button>
                </div>
                <Label>Load mapping JSON</Label>
                <FileInput onChange={handleLoadMapping} accept=".json" />
                <p className="text-xs text-cyan-300/80 mt-1">Auto-map guesses bone links. Save the result and re-import animations to apply.</p>

                <div className="mt-2 pt-2 border-t border-white/5">
                    <Label>Current Bone Mapping</Label>
                    <input
                        className="w-full p-1.5 rounded bg-slate-950 border border-white/10 text-cyan-200 text-sm mb-2"
                        placeholder="Search mapping..."
                        value={mappingSearch}
                        onChange={(e) => setMappingSearch(e.target.value)}
                    />
                    <div className="max-h-60 overflow-auto p-1.5 border border-dashed border-cyan-400/10 rounded-md text-xs space-y-1">
                        {filteredMapping.length > 0 ? (
                            filteredMapping.map(([source, target]) => (
                                <div
                                    key={source}
                                    className={`grid grid-cols-[1fr,auto,1fr] gap-2 items-center p-1 -mx-1 rounded transition-colors cursor-pointer ${
                                        highlightedBone === target
                                            ? 'bg-cyan-400/20'
                                            : 'hover:bg-cyan-500/10'
                                    }`}
                                    onClick={() => onSelectBoneForMapping(source, target)}
                                >
                                    <span className="text-cyan-300 truncate" title={source}>{source}</span>
                                    <span className="text-cyan-400/50">→</span>
                                    <Select
                                        value={target}
                                        onChange={(e) => handleMappingChange(source, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {targetBoneOptions}
                                    </Select>
                                </div>
                            ))
                        ) : (
                            <p className="text-cyan-300/60 p-1">No mapping loaded or search term matched.</p>
                        )}
                    </div>
                </div>
            </Section>

            <Section title="Spawn / Dev Camera">
                <div className="flex gap-2">
                    <Button onClick={onToggleDevCam}>Toggle Dev Free Cam</Button>
                    <Button onClick={onSaveSpawnNode}>Save Spawn From Cam</Button>
                </div>
                <div className="text-xs text-cyan-300 mt-2">Spawn: {spawnCoords}</div>
                <div className="mt-2.5 pt-2.5 border-t border-white/5">
                    <Label htmlFor="head-bone-select">Head Bone for FPS Test</Label>
                    <Select
                        id="head-bone-select"
                        value={headBoneName || ''}
                        onChange={(e) => setHeadBoneName(e.target.value || null)}
                        disabled={!baseSkeleton}
                    >
                        <option value="">-- Select a Bone --</option>
                        {baseSkeleton?.bones.map((bone: any) => (
                            <option key={bone.id} value={bone.name}>{bone.name}</option>
                        ))}
                    </Select>
                </div>
                 <div className="mt-2">
                    <Button onClick={onToggleTestMode}>
                        {editorMode === 'editor' ? 'Test Map (First Person)' : 'Return to Editor'}
                    </Button>
                </div>
            </Section>

            <div className="mt-4">
                <div className="text-xs text-cyan-300">Logs / Diagnostics</div>
                <pre className="h-32 overflow-auto text-xs bg-slate-950 p-2 rounded-md border border-white/5 text-cyan-200">
                    {logs.map(log => <div key={log.id}>{`${log.time} | ${log.message}`}</div>)}
                </pre>
            </div>
        </div>
    );
};

export default SidePanel;