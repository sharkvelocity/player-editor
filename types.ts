// Add a global declaration for the BABYLON object to satisfy TypeScript
declare const BABYLON: any;

export interface BabylonInjectedContext {
    scene: any; // BABYLON.Scene;
    engine: any; // BABYLON.Engine;
    canvas: HTMLCanvasElement;
    arcCam: any; // BABYLON.ArcRotateCamera;
    devCam: any; // BABYLON.FreeCamera;
}

export interface LogEntry {
    id: number;
    time: string;
    message: string;
}

export interface ImportedAnimFile {
    file: File;
    animationGroups: any[]; // BABYLON.AnimationGroup[];
}

// FIX: An interface cannot extend `any`. Changed to a type alias with an intersection
// to correctly augment the `BABYLON.AnimationGroup` type with metadata. This
// resolves both the syntax error here and the property access error in SidePanel.tsx.
export type RetargetedAnimGroup = any /* BABYLON.AnimationGroup */ & {
    meta: {
        sourceFileName: string;
    };
};

export type PlayerAction = 
    'idle' | 
    'walk' | 
    'run' | 
    'strafeLeft' | 
    'strafeRight' |
    'turnLeft' |
    'turnRight' |
    'standingToCrouch' |
    'crouchToStanding' |
    'crouchIdle' |
    'crouchWalk';

export const playerActions: PlayerAction[] = [
    'idle', 
    'walk', 
    'run',
    'strafeLeft',
    'strafeRight',
    'turnLeft',
    'turnRight',
    'crouchIdle',
    'crouchWalk',
    'standingToCrouch',
    'crouchToStanding',
];

export const initialAnimationLinks: Record<PlayerAction, string | null> = 
    playerActions.reduce((acc, action) => {
        acc[action] = null;
        return acc;
    }, {} as Record<PlayerAction, string | null>);