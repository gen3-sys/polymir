/**
 * AvatarAnimationMixer - Animation state machine for voxel avatars
 *
 * Manages animation playback, blending, and state transitions.
 * Supports layered animations (base + additive) and smooth transitions.
 *
 * Features:
 * - State machine for animation states (idle, walk, run, jump, etc.)
 * - Blend trees for smooth transitions
 * - Animation layering (base + additive)
 * - Speed/timescale control
 * - Built-in procedural animations
 */

import * as THREE from 'three';

// Animation state definitions
export const ANIMATION_STATE = {
    IDLE: 'idle',
    WALK: 'walk',
    RUN: 'run',
    JUMP: 'jump',
    FALL: 'fall',
    LAND: 'land',
    CROUCH: 'crouch',
    EMOTE: 'emote',
    CUSTOM: 'custom'
};

// Transition types
export const TRANSITION_TYPE = {
    IMMEDIATE: 'immediate',
    CROSSFADE: 'crossfade',
    ADDITIVE: 'additive'
};

// Built-in animation configurations
const DEFAULT_ANIMATIONS = {
    [ANIMATION_STATE.IDLE]: {
        duration: 2.0,
        loop: THREE.LoopRepeat,
        procedural: true,
        blendIn: 0.3,
        blendOut: 0.3
    },
    [ANIMATION_STATE.WALK]: {
        duration: 0.8,
        loop: THREE.LoopRepeat,
        procedural: true,
        blendIn: 0.2,
        blendOut: 0.2
    },
    [ANIMATION_STATE.RUN]: {
        duration: 0.5,
        loop: THREE.LoopRepeat,
        procedural: true,
        blendIn: 0.15,
        blendOut: 0.15
    },
    [ANIMATION_STATE.JUMP]: {
        duration: 0.5,
        loop: THREE.LoopOnce,
        procedural: true,
        blendIn: 0.1,
        blendOut: 0.2
    },
    [ANIMATION_STATE.FALL]: {
        duration: 1.0,
        loop: THREE.LoopRepeat,
        procedural: true,
        blendIn: 0.2,
        blendOut: 0.1
    }
};

export class AvatarAnimationMixer {
    constructor(options = {}) {
        // Reference to avatar rig
        this.rig = null;

        // Three.js AnimationMixer (for clip-based animations)
        this.mixer = null;

        // Current state
        this.currentState = ANIMATION_STATE.IDLE;
        this.previousState = null;
        this.stateTime = 0;

        // Animation clips
        this.clips = new Map(); // stateName → THREE.AnimationClip
        this.actions = new Map(); // stateName → THREE.AnimationAction

        // Procedural animation parameters
        this.proceduralEnabled = options.proceduralEnabled !== false;
        this.proceduralTime = 0;

        // Transition state
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 0.3;
        this.transitionFrom = null;

        // Speed multiplier
        this.timeScale = options.timeScale || 1.0;
        this.movementSpeed = 0; // Used for walk/run blending

        // Layered animations
        this.basePose = null;
        this.additiveActions = [];

        // Callbacks
        this.onStateChange = options.onStateChange || null;
        this.onAnimationComplete = options.onAnimationComplete || null;

        // Animation configuration
        this.animConfigs = { ...DEFAULT_ANIMATIONS, ...(options.animations || {}) };
    }

    /**
     * Initialize with avatar rig
     * @param {VoxelAvatarRig} rig - Avatar rig instance
     */
    initialize(rig) {
        this.rig = rig;

        // Create Three.js mixer for clip-based animations
        // Note: We'll apply transforms to the rig, not directly to meshes
        this.mixer = new THREE.AnimationMixer(new THREE.Object3D());

        // Store base pose
        this.basePose = this.captureCurrentPose();

        // Generate procedural animation clips
        if (this.proceduralEnabled) {
            this.generateProceduralClips();
        }
    }

    /**
     * Capture current rig pose
     */
    captureCurrentPose() {
        if (!this.rig) return null;

        const pose = {};
        for (const boneName of this.rig.getBoneNames()) {
            const bone = this.rig.getBone(boneName);
            if (bone) {
                pose[boneName] = {
                    rotation: { ...bone.rotation },
                    position: bone.positionOffset ? { ...bone.positionOffset } : null
                };
            }
        }
        return pose;
    }

    /**
     * Generate procedural animation clips
     */
    generateProceduralClips() {
        // Idle breathing animation
        this.clips.set(ANIMATION_STATE.IDLE, this.createIdleClip());

        // Walking animation
        this.clips.set(ANIMATION_STATE.WALK, this.createWalkClip());

        // Running animation
        this.clips.set(ANIMATION_STATE.RUN, this.createRunClip());

        // Jump animation
        this.clips.set(ANIMATION_STATE.JUMP, this.createJumpClip());
    }

    /**
     * Create idle breathing animation
     */
    createIdleClip() {
        const duration = this.animConfigs[ANIMATION_STATE.IDLE].duration;
        const tracks = [];

        // Subtle chest/spine breathing
        const spineRotation = new THREE.QuaternionKeyframeTrack(
            'spine.quaternion',
            [0, duration / 2, duration],
            [
                0, 0, 0, 1,                           // Start
                0, 0, Math.sin(0.02), Math.cos(0.02), // Breathe in (slight forward tilt)
                0, 0, 0, 1                            // End
            ]
        );
        tracks.push(spineRotation);

        // Subtle head movement
        const headRotation = new THREE.QuaternionKeyframeTrack(
            'head.quaternion',
            [0, duration * 0.3, duration * 0.7, duration],
            [
                0, 0, 0, 1,
                0, Math.sin(0.01), 0, Math.cos(0.01),   // Look slightly right
                0, Math.sin(-0.01), 0, Math.cos(-0.01), // Look slightly left
                0, 0, 0, 1
            ]
        );
        tracks.push(headRotation);

        return new THREE.AnimationClip(ANIMATION_STATE.IDLE, duration, tracks);
    }

    /**
     * Create walking animation
     */
    createWalkClip() {
        const duration = this.animConfigs[ANIMATION_STATE.WALK].duration;
        const tracks = [];

        // Leg swing amplitude
        const legSwing = 0.4;
        const armSwing = 0.3;

        // Left leg
        const leftLegRotation = new THREE.QuaternionKeyframeTrack(
            'leftUpperLeg.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(legSwing, duration)
        );
        tracks.push(leftLegRotation);

        // Right leg (opposite phase)
        const rightLegRotation = new THREE.QuaternionKeyframeTrack(
            'rightUpperLeg.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(-legSwing, duration)
        );
        tracks.push(rightLegRotation);

        // Left arm (opposite to left leg)
        const leftArmRotation = new THREE.QuaternionKeyframeTrack(
            'leftUpperArm.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(-armSwing, duration)
        );
        tracks.push(leftArmRotation);

        // Right arm (opposite to right leg)
        const rightArmRotation = new THREE.QuaternionKeyframeTrack(
            'rightUpperArm.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(armSwing, duration)
        );
        tracks.push(rightArmRotation);

        // Subtle hip rotation
        const hipsRotation = new THREE.QuaternionKeyframeTrack(
            'hips.quaternion',
            [0, duration / 2, duration],
            [
                0, Math.sin(0.03), 0, Math.cos(0.03),
                0, Math.sin(-0.03), 0, Math.cos(-0.03),
                0, Math.sin(0.03), 0, Math.cos(0.03)
            ]
        );
        tracks.push(hipsRotation);

        return new THREE.AnimationClip(ANIMATION_STATE.WALK, duration, tracks);
    }

    /**
     * Create running animation
     */
    createRunClip() {
        const duration = this.animConfigs[ANIMATION_STATE.RUN].duration;
        const tracks = [];

        // More exaggerated swing for running
        const legSwing = 0.6;
        const armSwing = 0.5;
        const kneeSwing = 0.4;

        // Upper legs
        tracks.push(new THREE.QuaternionKeyframeTrack(
            'leftUpperLeg.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(legSwing, duration)
        ));

        tracks.push(new THREE.QuaternionKeyframeTrack(
            'rightUpperLeg.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(-legSwing, duration)
        ));

        // Lower legs (more bend)
        tracks.push(new THREE.QuaternionKeyframeTrack(
            'leftLowerLeg.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createBendKeyframes(kneeSwing, duration)
        ));

        tracks.push(new THREE.QuaternionKeyframeTrack(
            'rightLowerLeg.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createBendKeyframes(kneeSwing, duration, true)
        ));

        // Arms
        tracks.push(new THREE.QuaternionKeyframeTrack(
            'leftUpperArm.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(-armSwing, duration)
        ));

        tracks.push(new THREE.QuaternionKeyframeTrack(
            'rightUpperArm.quaternion',
            [0, duration / 4, duration / 2, duration * 3 / 4, duration],
            this.createSwingKeyframes(armSwing, duration)
        ));

        // Torso lean forward
        tracks.push(new THREE.QuaternionKeyframeTrack(
            'spine.quaternion',
            [0, duration],
            [
                Math.sin(0.1), 0, 0, Math.cos(0.1),
                Math.sin(0.1), 0, 0, Math.cos(0.1)
            ]
        ));

        return new THREE.AnimationClip(ANIMATION_STATE.RUN, duration, tracks);
    }

    /**
     * Create jump animation
     */
    createJumpClip() {
        const duration = this.animConfigs[ANIMATION_STATE.JUMP].duration;
        const tracks = [];

        // Crouch before jump, then extend
        const hipPosition = new THREE.VectorKeyframeTrack(
            'hips.position',
            [0, duration * 0.2, duration * 0.5, duration],
            [
                0, 0, 0,        // Start
                0, -2, 0,       // Crouch
                0, 5, 0,        // Jump up
                0, 0, 0         // Land
            ]
        );
        tracks.push(hipPosition);

        // Arms raise
        tracks.push(new THREE.QuaternionKeyframeTrack(
            'leftUpperArm.quaternion',
            [0, duration * 0.3, duration * 0.7, duration],
            [
                0, 0, 0, 1,
                Math.sin(-0.5), 0, 0, Math.cos(-0.5),  // Arms up
                Math.sin(-0.3), 0, 0, Math.cos(-0.3),  // Arms slightly down
                0, 0, 0, 1
            ]
        ));

        tracks.push(new THREE.QuaternionKeyframeTrack(
            'rightUpperArm.quaternion',
            [0, duration * 0.3, duration * 0.7, duration],
            [
                0, 0, 0, 1,
                Math.sin(-0.5), 0, 0, Math.cos(-0.5),
                Math.sin(-0.3), 0, 0, Math.cos(-0.3),
                0, 0, 0, 1
            ]
        ));

        return new THREE.AnimationClip(ANIMATION_STATE.JUMP, duration, tracks);
    }

    /**
     * Helper: Create swing keyframes (for limb rotation)
     */
    createSwingKeyframes(amplitude, duration, offset = false) {
        const q = new THREE.Quaternion();
        const keyframes = [];

        const phases = [0, 0.25, 0.5, 0.75, 1.0];
        for (let i = 0; i < phases.length; i++) {
            const phase = phases[i] + (offset ? 0.5 : 0);
            const angle = Math.sin(phase * Math.PI * 2) * amplitude;
            q.setFromEuler(new THREE.Euler(angle, 0, 0));
            keyframes.push(q.x, q.y, q.z, q.w);
        }

        return keyframes;
    }

    /**
     * Helper: Create bend keyframes (for knee/elbow)
     */
    createBendKeyframes(amplitude, duration, offset = false) {
        const q = new THREE.Quaternion();
        const keyframes = [];

        const phases = [0, 0.25, 0.5, 0.75, 1.0];
        for (let i = 0; i < phases.length; i++) {
            const phase = phases[i] + (offset ? 0.5 : 0);
            // Only bend, don't extend
            const bend = Math.max(0, Math.sin(phase * Math.PI * 2)) * amplitude;
            q.setFromEuler(new THREE.Euler(bend, 0, 0));
            keyframes.push(q.x, q.y, q.z, q.w);
        }

        return keyframes;
    }

    /**
     * Load external animation clip
     */
    loadAnimationClip(stateName, clip) {
        this.clips.set(stateName, clip);

        // Create action if mixer exists
        if (this.mixer) {
            const action = this.mixer.clipAction(clip);
            this.actions.set(stateName, action);
        }
    }

    /**
     * Set animation state
     * @param {string} state - Animation state to transition to
     * @param {Object} options - Transition options
     */
    setState(state, options = {}) {
        if (state === this.currentState && !options.force) {
            return;
        }

        const config = this.animConfigs[state] || {};

        // Store previous state
        this.previousState = this.currentState;
        this.transitionFrom = this.currentState;

        // Start transition
        this.isTransitioning = true;
        this.transitionProgress = 0;
        this.transitionDuration = options.transitionDuration ?? config.blendIn ?? 0.3;

        // Update current state
        this.currentState = state;
        this.stateTime = 0;

        // Fire callback
        if (this.onStateChange) {
            this.onStateChange(state, this.previousState);
        }
    }

    /**
     * Update animation
     * @param {number} deltaTime - Time since last update
     */
    update(deltaTime) {
        const scaledDelta = deltaTime * this.timeScale;

        // Update transition
        if (this.isTransitioning) {
            this.transitionProgress += scaledDelta / this.transitionDuration;
            if (this.transitionProgress >= 1.0) {
                this.transitionProgress = 1.0;
                this.isTransitioning = false;
            }
        }

        // Update state time
        this.stateTime += scaledDelta;
        this.proceduralTime += scaledDelta;

        // Update Three.js mixer
        if (this.mixer) {
            this.mixer.update(scaledDelta);
        }

        // Apply procedural animation
        if (this.proceduralEnabled && this.rig) {
            this.applyProceduralAnimation(scaledDelta);
        }

        // Check for animation completion
        const config = this.animConfigs[this.currentState];
        if (config && config.loop === THREE.LoopOnce && this.stateTime >= config.duration) {
            if (this.onAnimationComplete) {
                this.onAnimationComplete(this.currentState);
            }
            // Auto-transition to idle
            this.setState(ANIMATION_STATE.IDLE);
        }
    }

    /**
     * Apply procedural animation to rig
     */
    applyProceduralAnimation(deltaTime) {
        if (!this.rig) return;

        const clip = this.clips.get(this.currentState);
        if (!clip) return;

        const config = this.animConfigs[this.currentState] || {};
        const duration = config.duration || 1.0;

        // Calculate animation time (looping)
        let animTime = this.stateTime % duration;

        // Sample clip and apply to rig
        for (const track of clip.tracks) {
            // Parse bone name from track
            const boneName = track.name.split('.')[0];
            const bone = this.rig.getBone(boneName);
            if (!bone) continue;

            // Sample track at current time
            const value = this.sampleTrack(track, animTime);

            // Apply transition blending
            if (this.isTransitioning && this.basePose && this.basePose[boneName]) {
                const basePose = this.basePose[boneName];
                const blendFactor = this.smoothstep(this.transitionProgress);

                if (track.name.includes('quaternion') && basePose.rotation) {
                    // Slerp quaternion
                    const baseQ = new THREE.Quaternion(
                        basePose.rotation.x,
                        basePose.rotation.y,
                        basePose.rotation.z,
                        basePose.rotation.w
                    );
                    const targetQ = new THREE.Quaternion(value[0], value[1], value[2], value[3]);
                    baseQ.slerp(targetQ, blendFactor);
                    bone.rotation = { x: baseQ.x, y: baseQ.y, z: baseQ.z, w: baseQ.w };
                }
            } else {
                // Direct application
                if (track.name.includes('quaternion')) {
                    bone.rotation = { x: value[0], y: value[1], z: value[2], w: value[3] };
                } else if (track.name.includes('position')) {
                    bone.positionOffset = { x: value[0], y: value[1], z: value[2] };
                }
            }
        }

        // Update rig transforms
        this.rig.updateWorldTransforms();
    }

    /**
     * Sample animation track at specific time
     */
    sampleTrack(track, time) {
        const times = track.times;
        const values = track.values;
        const valueSize = values.length / times.length;

        // Find surrounding keyframes
        let i = 0;
        while (i < times.length - 1 && times[i + 1] <= time) {
            i++;
        }

        if (i >= times.length - 1) {
            // Past end, return last value
            const start = (times.length - 1) * valueSize;
            return values.slice(start, start + valueSize);
        }

        // Interpolate
        const t0 = times[i];
        const t1 = times[i + 1];
        const alpha = (time - t0) / (t1 - t0);

        const result = [];
        for (let j = 0; j < valueSize; j++) {
            const v0 = values[i * valueSize + j];
            const v1 = values[(i + 1) * valueSize + j];
            result.push(v0 + (v1 - v0) * alpha);
        }

        return result;
    }

    /**
     * Smoothstep interpolation
     */
    smoothstep(t) {
        t = Math.max(0, Math.min(1, t));
        return t * t * (3 - 2 * t);
    }

    /**
     * Set movement speed (affects walk/run blending)
     */
    setMovementSpeed(speed) {
        this.movementSpeed = speed;

        // Auto-switch between idle/walk/run based on speed
        if (speed < 0.1) {
            if (this.currentState !== ANIMATION_STATE.IDLE) {
                this.setState(ANIMATION_STATE.IDLE);
            }
        } else if (speed < 5) {
            if (this.currentState !== ANIMATION_STATE.WALK) {
                this.setState(ANIMATION_STATE.WALK);
            }
            // Adjust walk speed
            this.timeScale = speed / 3;
        } else {
            if (this.currentState !== ANIMATION_STATE.RUN) {
                this.setState(ANIMATION_STATE.RUN);
            }
            // Adjust run speed
            this.timeScale = speed / 8;
        }
    }

    /**
     * Play emote animation
     */
    playEmote(emoteName, clip = null) {
        if (clip) {
            this.loadAnimationClip(ANIMATION_STATE.EMOTE, clip);
        }
        this.setState(ANIMATION_STATE.EMOTE);
    }

    /**
     * Get current animation state
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * Check if currently transitioning
     */
    isInTransition() {
        return this.isTransitioning;
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }
        this.clips.clear();
        this.actions.clear();
        this.rig = null;
    }
}

export default AvatarAnimationMixer;
