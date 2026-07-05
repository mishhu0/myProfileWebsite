import * as THREE from 'three';

const MODE_IDS = ['v1', 'v2'];
const DEFAULT_MODE = 'v1';
const MAX_PIXEL_RATIO = 1.5;
const ROTATION_SPEED_LIMIT = 5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PARTICLE_LIMIT = 900;

const DEFAULT_THEME = {
    primary: '#8fe8ff',
    secondary: '#2bd9ff',
    accent: '#5a86ff',
    highlight: '#9ad8ff',
    background: '#05070d'
};

function createDefaultAudioState() {
    return {
        level: 0,
        bass: 0,
        mids: 0,
        highs: 0,
        levelImpact: 0,
        bassImpact: 0,
        midsImpact: 0,
        highsImpact: 0,
        kick: 0,
        snare: 0,
        hat: 0,
        kickImpact: 0,
        snareImpact: 0,
        hatImpact: 0,
        presence: 0,
        stereoWidth: 0,
        stereoPan: 0,
        stereoMotion: 0,
        beatPulse: 0,
        downbeatPulse: 0,
        beatConfidence: 0,
        barPhase: 0,
        barDrift: 0,
        responseDrive: 0,
        surfaceDrive: 1,
        cameraDrive: 1,
        intimacyDrive: 1,
        spectrum: []
    };
}

const state = {
    mode: DEFAULT_MODE,
    rotationSpeed: 0,
    theme: { ...DEFAULT_THEME },
    audio: createDefaultAudioState()
};

const refs = {
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    animationFrameId: 0,
    lastTimestamp: 0,
    root: null,
    lights: {
        ambient: null,
        key: null,
        rim: null
    },
    modes: {},
    runtime: {
        orbitAngle: 0,
        distance: 5.2,
        particleDistance: 4.25,
        height: 0.22,
        lookY: 0.1,
        fov: 48,
        recoil: 0,
        zoomPulse: 0,
        zoomBreath: 0,
        zoomMotion: 0,
        zoomDrift: 0,
        swayX: 0,
        swayY: 0
    },
    size: {
        width: 0,
        height: 0
    }
};

const particleLookTarget = new THREE.Vector3();
const particleForward = new THREE.Vector3();
const particleAnchor = new THREE.Vector3();
const waveAccentAnchor = new THREE.Vector3();
const waveAccentLeft = new THREE.Vector3();
const waveAccentUp = new THREE.Vector3();
const waveAccentForward = new THREE.Vector3();

let particleTexture = null;

function clampRange(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
}

function clampPositive(value, max) {
    return clampRange(value, 0, max);
}

function clampSigned(value, max) {
    const limit = Math.max(0, Number(max) || 0);
    return clampRange(value, -limit, limit);
}

function clamp01(value) {
    return clampRange(value, 0, 1);
}

function smoothstep(edge0, edge1, value) {
    const x = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
    return x * x * (3 - (2 * x));
}

function damp(current, target, rate, delta) {
    const safeRate = Math.max(0.01, Number(rate) || 0.01);
    const blend = 1 - Math.exp(-Math.max(0.001, delta) * safeRate);
    return current + ((target - current) * blend);
}

function dampDirectional(current, target, riseRate, fallRate, delta) {
    return damp(current, target, target > current ? riseRate : fallRate, delta);
}

function softLimit(value, limit) {
    const safeLimit = Math.max(0.0001, Number(limit) || 0.0001);
    return Math.tanh(value / safeLimit) * safeLimit;
}

function createWeldedGeometry(sourceGeometry) {
    if (sourceGeometry.index) {
        return sourceGeometry;
    }

    const sourcePosition = sourceGeometry.getAttribute('position');
    const weldedGeometry = new THREE.BufferGeometry();
    const weldedPositions = [];
    const weldedIndices = [];
    const weldedLookup = new Map();
    const tolerance = 100000;

    for (let index = 0; index < sourcePosition.count; index += 1) {
        const x = sourcePosition.getX(index);
        const y = sourcePosition.getY(index);
        const z = sourcePosition.getZ(index);
        const key = [
            Math.round(x * tolerance),
            Math.round(y * tolerance),
            Math.round(z * tolerance)
        ].join('|');

        let weldedIndex = weldedLookup.get(key);

        if (weldedIndex === undefined) {
            weldedIndex = weldedPositions.length / 3;
            weldedLookup.set(key, weldedIndex);
            weldedPositions.push(x, y, z);
        }

        weldedIndices.push(weldedIndex);
    }

    weldedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(weldedPositions, 3));
    weldedGeometry.setIndex(weldedIndices);
    weldedGeometry.parameters = sourceGeometry.parameters;
    weldedGeometry.computeVertexNormals();

    return weldedGeometry;
}

function createVertexNeighbors(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const vertexNeighborSets = Array.from({ length: position.count }, function() { return new Set(); });

    if (!index) {
        return vertexNeighborSets.map(function(set) { return Array.from(set); });
    }

    const indices = index.array;

    for (let indexOffset = 0; indexOffset < indices.length; indexOffset += 3) {
        const a = indices[indexOffset];
        const b = indices[indexOffset + 1];
        const c = indices[indexOffset + 2];

        vertexNeighborSets[a].add(b);
        vertexNeighborSets[a].add(c);
        vertexNeighborSets[b].add(a);
        vertexNeighborSets[b].add(c);
        vertexNeighborSets[c].add(a);
        vertexNeighborSets[c].add(b);
    }

    return vertexNeighborSets.map(function(set) { return Array.from(set); });
}

function getDirectionalSeed(x, y, z, offset) {
    const qx = Math.round((Number(x) || 0) * 16384);
    const qy = Math.round((Number(y) || 0) * 16384);
    const qz = Math.round((Number(z) || 0) * 16384);
    const seed = Math.sin((qx * 12.9898) + (qy * 78.233) + (qz * 37.719) + ((Number(offset) || 0) * 19.19)) * 43758.5453;
    return seed - Math.floor(seed);
}

function getMinimumFramingDistance(radius, fovDegrees, aspect, padding) {
    const safeRadius = Math.max(0.01, Number(radius) || 0.01);
    const safeAspect = Math.max(0.1, Number(aspect) || 1);
    const safePadding = Math.max(1, Number(padding) || 1);
    const halfVerticalFov = THREE.MathUtils.degToRad(clampRange(fovDegrees, 20, 120) * 0.5);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * safeAspect);
    const limitingHalfFov = Math.max(0.08, Math.min(halfVerticalFov, halfHorizontalFov));
    return (safeRadius * safePadding) / Math.tan(limitingHalfFov);
}

function getColor(value, fallback) {
    return new THREE.Color(typeof value === 'string' || typeof value === 'number' ? value : fallback);
}

function getSpectrumValue(spectrum, normalizedIndex) {
    if (!Array.isArray(spectrum) || !spectrum.length) return 0;
    const index = Math.round(clamp01(normalizedIndex) * (spectrum.length - 1));
    return clampRange(spectrum[index], 0, 1.25);
}

function createParticleTexture() {
    if (particleTexture) return particleTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.clearRect(0, 0, 96, 96);
    context.fillStyle = 'rgba(255,255,255,0.16)';
    context.beginPath();
    context.arc(48, 48, 34, 0, Math.PI * 2);
    context.fill();

    context.font = '72px serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 2;
    context.strokeStyle = 'rgba(255,255,255,0.34)';
    context.fillStyle = 'rgba(255,255,255,0.98)';
    context.strokeText('꩜', 48, 50);
    context.fillText('꩜', 48, 50);

    particleTexture = new THREE.CanvasTexture(canvas);
    particleTexture.needsUpdate = true;
    return particleTexture;
}

function createParticleField(count, innerRadius, outerRadius, baseSize) {
    const particleCount = Math.min(PARTICLE_LIMIT, Math.max(220, Math.floor(count * 1.46)));
    const positions = new Float32Array(particleCount * 3);
    const horizontalHalfExtent = Math.max(innerRadius * 2.08, outerRadius * 1.18);
    const verticalHalfExtent = Math.max(innerRadius * 1.58, outerRadius * 1.04);
    const depthHalfExtent = Math.max(innerRadius * 1.26, outerRadius * 0.8);
    const exclusionRadius = innerRadius * 2;
    const silhouetteExclusionX = innerRadius * 1.2;
    const silhouetteExclusionY = innerRadius * 1.2;
    const gridSize = Math.max(1, Math.ceil(Math.cbrt(particleCount)));
    const cellWidth = (horizontalHalfExtent * 2) / gridSize;
    const cellHeight = (verticalHalfExtent * 2) / gridSize;
    const cellDepth = (depthHalfExtent * 2) / gridSize;

    for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3;
        const xIndex = index % gridSize;
        const yIndex = Math.floor(index / gridSize) % gridSize;
        const zIndex = Math.floor(index / (gridSize * gridSize));
        let x = (-horizontalHalfExtent) + ((xIndex + 0.5) * cellWidth) + ((Math.random() - 0.5) * cellWidth * 0.74);
        let y = (-verticalHalfExtent) + ((yIndex + 0.5) * cellHeight) + ((Math.random() - 0.5) * cellHeight * 0.74);
        let z = (-depthHalfExtent) + ((zIndex + 0.5) * cellDepth) + ((Math.random() - 0.5) * cellDepth * 0.74);
        const distance = Math.sqrt((x * x) + (y * y) + (z * z));

        if (distance < exclusionRadius) {
            const safeDistance = Math.max(distance, 0.0001);
            const pushDistance = exclusionRadius + (Math.min(cellWidth, cellHeight, cellDepth) * (0.2 + (Math.random() * 0.22)));
            const pushScale = pushDistance / safeDistance;
            x *= pushScale;
            y *= pushScale;
            z *= pushScale;
        }

        const silhouetteDistance = Math.sqrt(
            ((x * x) / Math.max(0.0001, silhouetteExclusionX * silhouetteExclusionX)) +
            ((y * y) / Math.max(0.0001, silhouetteExclusionY * silhouetteExclusionY))
        );

        if (silhouetteDistance < 1) {
            const safeSilhouetteDistance = Math.max(silhouetteDistance, 0.0001);
            const pushDistance = 1 + ((Math.min(cellWidth, cellHeight) * (0.32 + (Math.random() * 0.26))) / Math.max(silhouetteExclusionX, silhouetteExclusionY));

            if (safeSilhouetteDistance <= 0.00011) {
                const angle = Math.random() * Math.PI * 2;
                x = Math.cos(angle) * silhouetteExclusionX * pushDistance;
                y = Math.sin(angle) * silhouetteExclusionY * pushDistance;
            } else {
                x *= pushDistance / safeSilhouetteDistance;
                y *= pushDistance / safeSilhouetteDistance;
            }
        }

        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: baseSize * 3,
        transparent: true,
        opacity: 0.64,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        map: createParticleTexture(),
        alphaMap: createParticleTexture(),
        alphaTest: 0.08
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    function applyTheme(theme) {
        material.color.copy(getColor(theme.highlight, DEFAULT_THEME.highlight)).lerp(getColor(theme.primary, DEFAULT_THEME.primary), 0.2);
    }

    function update() {
        material.size = baseSize * 3;
        material.opacity = 0.64;
    }

    return {
        points,
        applyTheme,
        update
    };
}

function createStaticOrientationField(count, innerRadius, outerRadius, baseSize) {
    const particleCount = Math.max(56, Math.min(180, Math.floor(count)));
    const positions = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3;
        const y = 1 - ((index / Math.max(1, particleCount - 1)) * 2);
        const radius = Math.sqrt(Math.max(0, 1 - (y * y)));
        const theta = GOLDEN_ANGLE * index;
        const shellRadius = innerRadius + (Math.random() * Math.max(0.0001, outerRadius - innerRadius));

        positions[offset] = Math.cos(theta) * radius * shellRadius;
        positions[offset + 1] = y * shellRadius;
        positions[offset + 2] = Math.sin(theta) * radius * shellRadius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: baseSize,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.NormalBlending,
        map: createParticleTexture(),
        alphaMap: createParticleTexture(),
        alphaTest: 0.02
    });

    const points = new THREE.Points(geometry, material);

    function applyTheme(theme) {
        material.color.copy(getColor(theme.highlight, DEFAULT_THEME.highlight)).lerp(getColor(theme.secondary, DEFAULT_THEME.secondary), 0.35);
    }

    return {
        points,
        applyTheme
    };
}

function createLiquidSphereMode(profile) {
    const group = new THREE.Group();
    const geometry = createWeldedGeometry(profile.geometryFactory());
    const positionAttribute = geometry.getAttribute('position');
    const normalAttribute = geometry.getAttribute('normal');
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    const surfaceSignalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count), 1);
    surfaceSignalAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('surfaceSignal', surfaceSignalAttribute);
    const basePositions = new Float32Array(positionAttribute.array);
    const baseNormals = new Float32Array(positionAttribute.array.length);
    const baseTangents = new Float32Array(positionAttribute.array.length);
    const baseBitangents = new Float32Array(positionAttribute.array.length);
    const phases = new Float32Array(positionAttribute.count);
    const latitudes = new Float32Array(positionAttribute.count);
    const spectrumOffsets = new Float32Array(positionAttribute.count);
    const stereoSigns = new Float32Array(positionAttribute.count);
    const topWeights = new Float32Array(positionAttribute.count);
    const equatorWeights = new Float32Array(positionAttribute.count);
    const sideWeights = new Float32Array(positionAttribute.count);
    const bottomWeights = new Float32Array(positionAttribute.count);
    const radialOffsets = new Float32Array(positionAttribute.count);
    const tangentOffsets = new Float32Array(positionAttribute.count);
    const bitangentOffsets = new Float32Array(positionAttribute.count);
    const smoothedRadialOffsets = new Float32Array(positionAttribute.count);
    const roundedRadialOffsets = new Float32Array(positionAttribute.count);
    const seamPairs = [];
    const vertexNeighbors = createVertexNeighbors(geometry);
    const widthSegments = geometry.parameters && Number.isFinite(geometry.parameters.widthSegments)
        ? Math.max(0, Math.floor(geometry.parameters.widthSegments))
        : 0;
    const heightSegments = geometry.parameters && Number.isFinite(geometry.parameters.heightSegments)
        ? Math.max(0, Math.floor(geometry.parameters.heightSegments))
        : 0;

    if (widthSegments > 0 && heightSegments > 0) {
        const rowStride = widthSegments + 1;

        for (let row = 0; row <= heightSegments; row += 1) {
            seamPairs.push([row * rowStride, (row * rowStride) + widthSegments]);
        }
    }

    for (let index = 0; index < positionAttribute.count; index += 1) {
        const offset = index * 3;
        const x = basePositions[offset];
        const y = basePositions[offset + 1];
        const z = basePositions[offset + 2];
        const length = Math.sqrt((x * x) + (y * y) + (z * z)) || 1;
        const normalX = x / length;
        const normalY = y / length;
        const normalZ = z / length;
        let tangentX = -normalZ;
        let tangentY = 0;
        let tangentZ = normalX;
        let tangentLength = Math.sqrt((tangentX * tangentX) + (tangentY * tangentY) + (tangentZ * tangentZ));

        if (tangentLength < 0.0001) {
            tangentX = 1;
            tangentY = 0;
            tangentZ = 0;
            tangentLength = 1;
        }

        tangentX /= tangentLength;
        tangentY /= tangentLength;
        tangentZ /= tangentLength;

        const bitangentX = (normalY * tangentZ) - (normalZ * tangentY);
        const bitangentY = (normalZ * tangentX) - (normalX * tangentZ);
        const bitangentZ = (normalX * tangentY) - (normalY * tangentX);
        const phaseSeed = getDirectionalSeed(normalX, normalY, normalZ, 1);
        const spectrumSeed = getDirectionalSeed(normalX, normalY, normalZ, 2);
        const stereoSeed = getDirectionalSeed(normalX, normalY, normalZ, 3);

        baseNormals[offset] = normalX;
        baseNormals[offset + 1] = normalY;
        baseNormals[offset + 2] = normalZ;
        baseTangents[offset] = tangentX;
        baseTangents[offset + 1] = tangentY;
        baseTangents[offset + 2] = tangentZ;
        baseBitangents[offset] = bitangentX;
        baseBitangents[offset + 1] = bitangentY;
        baseBitangents[offset + 2] = bitangentZ;
        phases[index] = phaseSeed * Math.PI * 2;
        latitudes[index] = Math.asin(clampSigned(normalY, 1));
        spectrumOffsets[index] = spectrumSeed;
        stereoSigns[index] = stereoSeed > 0.5 ? 1 : -1;
        topWeights[index] = smoothstep(-0.16, 0.98, normalY);
        equatorWeights[index] = clamp01(1 - Math.pow(Math.abs(normalY), 1.3));
        sideWeights[index] = 0.28 + (0.72 * (1 - Math.abs(normalY)));
        bottomWeights[index] = smoothstep(-0.16, 0.98, -normalY);
    }

    const patchCount = Math.max(1, Math.round(profile.waveCount));
    const patchCenters = new Float32Array(patchCount * 3);
    const patchPhases = new Float32Array(patchCount);

    for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
        const patchT = patchCount === 1 ? 0.5 : ((patchIndex + 0.5) / patchCount);
        const patchY = 1 - (patchT * 2);
        const patchRadius = Math.sqrt(Math.max(0, 1 - (patchY * patchY)));
        const patchTheta = GOLDEN_ANGLE * patchIndex;
        const patchX = Math.cos(patchTheta) * patchRadius;
        const patchZ = Math.sin(patchTheta) * patchRadius;

        const patchOffset = patchIndex * 3;

        patchCenters[patchOffset] = patchX;
        patchCenters[patchOffset + 1] = patchY;
        patchCenters[patchOffset + 2] = patchZ;
        patchPhases[patchIndex] = getDirectionalSeed(patchX, patchY, patchZ, 4) * Math.PI * 2;
    }

    const shellMaterial = new THREE.MeshLambertMaterial({
        color: DEFAULT_THEME.primary,
        emissive: DEFAULT_THEME.secondary,
        emissiveIntensity: 0.04,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.FrontSide
    });
    const innerMaterial = new THREE.MeshLambertMaterial({
        color: DEFAULT_THEME.secondary,
        emissive: DEFAULT_THEME.accent,
        emissiveIntensity: 0.03,
        transparent: true,
        opacity: 0.06,
        depthWrite: false
    });
    const shellOcclusionMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.FrontSide,
        depthWrite: true,
        depthTest: true
    });
    shellOcclusionMaterial.colorWrite = false;
    const shell = new THREE.Mesh(geometry, shellMaterial);
    shell.renderOrder = 1;
    const shellOcclusion = new THREE.Mesh(geometry, shellOcclusionMaterial);
    shellOcclusion.renderOrder = 2;
    const innerCore = new THREE.Mesh(new THREE.SphereGeometry(profile.radius * 0.76, 44, 34), innerMaterial);
    const particles = createParticleField(profile.particleCount, profile.radius * 1.14, profile.radius * 2.12, profile.particleSize);
    group.rotation.order = 'YXZ';
    const surface = {
        swell: 0,
        pulse: 0,
        retract: 0,
        ripple: 0,
        crest: 0,
        spread: 0,
        flow: 0,
        tide: 0,
        cohesion: 0,
        softness: 0,
        storm: 0,
        chop: 0,
        drift: 0,
        droplet: 0,
        lateral: 0,
        gloss: 0,
        buoyancy: 0,
        corePulse: 0,
        outwardPulse: 0
    };
    const rotationState = {
        x: 0,
        y: 0,
        z: 0
    };
    const framing = {
        radius: profile.radius,
        padding: profile.framingPadding,
        surfaceGap: profile.cameraSurfaceGap
    };

    group.add(shell);
    group.add(shellOcclusion);
    group.add(innerCore);

    function applyTheme(theme) {
        shellMaterial.color.copy(getColor(theme.primary, DEFAULT_THEME.primary));
        shellMaterial.emissive.copy(getColor(theme.secondary, DEFAULT_THEME.secondary));
        innerMaterial.color.copy(getColor(theme.secondary, DEFAULT_THEME.secondary));
        innerMaterial.emissive.copy(getColor(theme.accent, DEFAULT_THEME.accent));
        particles.applyTheme(theme);
    }

    function update(elapsed, delta, audio) {
        const level = clampPositive(audio.level, 1.35);
        const bass = clampPositive(audio.bass, 1.35);
        const mids = clampPositive(audio.mids, 1.35);
        const highs = clampPositive(audio.highs, 1.35);
        const kick = clampPositive(audio.kick, 1.5) / 1.5;
        const snare = clampPositive(audio.snare, 1.5) / 1.5;
        const hat = clampPositive(audio.hat, 1.5) / 1.5;
        const presence = clampPositive(audio.presence, 1.5) / 1.5;
        const levelImpact = clampPositive(audio.levelImpact, 2.5) / 2.5;
        const bassImpact = clampPositive(audio.bassImpact || audio.kickImpact, 2.5) / 2.5;
        const midsImpact = clampPositive(audio.midsImpact || audio.snareImpact, 2.5) / 2.5;
        const highsImpact = clampPositive(audio.highsImpact || audio.hatImpact, 2.5) / 2.5;
        const kickImpact = clampPositive(audio.kickImpact || audio.bassImpact, 2.5) / 2.5;
        const snareImpact = clampPositive(audio.snareImpact || audio.midsImpact, 2.5) / 2.5;
        const hatImpact = clampPositive(audio.hatImpact || audio.highsImpact, 2.5) / 2.5;
        const beatPulse = clampPositive(audio.beatPulse, 1.5) / 1.5;
        const downbeatPulse = clampPositive(audio.downbeatPulse, 1.5) / 1.5;
        const beatConfidence = clamp01(audio.beatConfidence);
        const barPhase = clamp01(audio.barPhase);
        const barDrift = clampSigned(audio.barDrift, 1);
        const stereoWidth = clampPositive(audio.stereoWidth, 1.3) / 1.3;
        const stereoPan = clampSigned(audio.stereoPan, 1);
        const stereoMotion = clampPositive(audio.stereoMotion, 1.5) / 1.5;
        const responseDrive = clamp01(audio.responseDrive);
        const surfaceDrive = clampPositive(audio.surfaceDrive, 2.4);
        const cameraDrive = clampPositive(audio.cameraDrive, 2.4);
        const intimacyDrive = clampPositive(audio.intimacyDrive, 2.2);

        const directSurge = clampPositive(
            (bass * 0.58)
            + (kick * 0.42)
            + (bassImpact * 0.5)
            + (kickImpact * 0.56)
            + (downbeatPulse * 0.28)
            + (levelImpact * 0.2),
            2.4
        ) / 2.2;
        const directCrest = clampPositive(
            (mids * 0.42)
            + (snare * 0.34)
            + (midsImpact * 0.48)
            + (snareImpact * 0.46)
            + (presence * 0.14),
            2.3
        ) / 2.1;
        const directRipples = clampPositive(
            (highs * 0.48)
            + (hat * 0.34)
            + (highsImpact * 0.44)
            + (hatImpact * 0.42)
            + (stereoWidth * 0.18),
            2.2
        ) / 2;
        const directSpread = clampPositive(
            (directSurge * 0.72)
            + (directCrest * 0.68)
            + (stereoWidth * 0.36)
            + (stereoMotion * 0.28)
            + (mids * 0.22),
            2.6
        ) / 2.1;

        surface.swell = dampDirectional(surface.swell, (bass * 0.92) + (kick * 0.56) + (bassImpact * 0.84) + (kickImpact * 0.98) + (downbeatPulse * 0.52) + (levelImpact * 0.28), 38 + (surfaceDrive * 14.2), 13.2 + (surfaceDrive * 4.8), delta);
        surface.pulse = dampDirectional(surface.pulse, (levelImpact * 1.02) + (beatPulse * 0.84) + (bassImpact * 0.56) + (kickImpact * 0.48) + (snareImpact * 0.3) + (downbeatPulse * 0.26), 48 + (responseDrive * 19.5), 15.6 + (responseDrive * 5.2), delta);
        surface.retract = dampDirectional(surface.retract, (highs * 0.16) + (hat * 0.12) + (hatImpact * 0.24) + ((1 - beatConfidence) * 0.03), 14 + (responseDrive * 9), 5.2, delta);
        surface.ripple = dampDirectional(surface.ripple, (highs * 0.44) + (hat * 0.18) + (hatImpact * 0.22) + (stereoWidth * 0.12) + (presence * 0.08), 16 + (responseDrive * 7.4), 6.8, delta);
        surface.crest = dampDirectional(surface.crest, (mids * 0.48) + (snare * 0.32) + (midsImpact * 0.58) + (snareImpact * 0.48) + (presence * 0.18), 22 + (responseDrive * 10.8), 8.2, delta);
        surface.spread = dampDirectional(surface.spread, directSpread + (surface.swell * 0.46) + (surface.pulse * 0.42) + (downbeatPulse * 0.2), 34 + (surfaceDrive * 12.4), 11.6 + (surfaceDrive * 3.8), delta);
        surface.flow = dampDirectional(surface.flow, (directSpread * 0.44) + (surface.spread * 0.32) + (stereoMotion * 0.18) + (mids * 0.12), 12.8 + (surfaceDrive * 6.2), 5.6 + (surfaceDrive * 1.8), delta);
        surface.tide = dampDirectional(surface.tide, (directSurge * 0.56) + (surface.swell * 0.42) + (surface.pulse * 0.3) + (downbeatPulse * 0.26), 15 + (surfaceDrive * 6.8), 6.4 + (surfaceDrive * 2.2), delta);
        surface.cohesion = dampDirectional(surface.cohesion, (surface.tide * 0.4) + (surface.flow * 0.34) + (presence * 0.16) + (beatConfidence * 0.14), 7 + (responseDrive * 4), 3.6 + (responseDrive * 1.4), delta);
        surface.softness = dampDirectional(surface.softness, 0.12 + (surface.cohesion * 0.62) + (surface.flow * 0.14) + (presence * 0.12) + (surface.swell * 0.08), 8 + (responseDrive * 3.4), 4.2 + (responseDrive * 1.5), delta);
        surface.storm = dampDirectional(surface.storm, (directSurge * 0.46) + (surface.tide * 0.32) + (directCrest * 0.18) + (downbeatPulse * 0.14) + (responseDrive * 0.08), 9 + (surfaceDrive * 5.4), 4 + (surfaceDrive * 1.2), delta);
        surface.chop = dampDirectional(surface.chop, (directRipples * 0.14) + (surface.flow * 0.12) + (stereoWidth * 0.08) + (highs * 0.04), 8.8 + (responseDrive * 3.6), 5.4 + (responseDrive * 1.6), delta);
        surface.drift = dampDirectional(surface.drift, (stereoMotion * 0.46) + (mids * 0.28) + (responseDrive * 0.18) + (Math.abs(barDrift) * 0.22), 10 + (cameraDrive * 5.6), 5, delta);
        surface.droplet = dampDirectional(surface.droplet, (bass * 0.78) + (kick * 0.44) + (bassImpact * 0.92) + (kickImpact * 1.06) + ((intimacyDrive - 1) * 0.34) + (downbeatPulse * 0.42), 30 + (surfaceDrive * 11.2), 8.4, delta);
        surface.lateral = dampDirectional(surface.lateral, clampSigned(stereoPan + (barDrift * 0.6), 1), 7 + (cameraDrive * 4), 6 + (cameraDrive * 2.5), delta);
        surface.gloss = dampDirectional(surface.gloss, (highs * 0.54) + (hatImpact * 0.24) + (presence * 0.18) + (responseDrive * 0.26), 12 + (responseDrive * 6), 5, delta);
        surface.buoyancy = dampDirectional(surface.buoyancy, (presence * 0.46) + ((intimacyDrive - 1) * 0.48) + (beatPulse * 0.16) + (directSurge * 0.2), 8 + (intimacyDrive * 5), 4.2, delta);
        surface.corePulse = dampDirectional(surface.corePulse, (kickImpact * 1.18) + (bassImpact * 0.92) + (downbeatPulse * 0.54) + (directSurge * 0.62) + (levelImpact * 0.18), 58 + (surfaceDrive * 18), 12 + (surfaceDrive * 4.6), delta);
        surface.outwardPulse = dampDirectional(surface.outwardPulse, surface.corePulse, 18 + (surfaceDrive * 7.2), 8.6 + (surfaceDrive * 3.2), delta);

        const clayDrive = clampPositive(
            (surface.swell * 0.64)
            + (surface.pulse * 0.56)
            + (surface.spread * 0.42)
            + (surface.droplet * 0.36)
            + (directSurge * 0.46)
            + (beatPulse * 0.22)
            + (downbeatPulse * 0.2)
            + (levelImpact * 0.14),
            4.6
        ) / 2.9;
        const clayShapeDrive = clampPositive(
            (surface.tide * 0.46)
            + (surface.softness * 0.34)
            + (surface.cohesion * 0.28)
            + (directCrest * 0.18)
            + (presence * 0.14),
            3.8
        ) / 2.5;

        const phraseBreath = Math.sin((barPhase * Math.PI * 2) - (Math.PI * 0.5));
        const songPhase = barPhase * Math.PI * 2;
        const deformationActivity = smoothstep(
            0.08,
            0.58,
            clampPositive(
                (surface.swell * 0.54)
                + (surface.pulse * 0.48)
                + (surface.spread * 0.28)
                + (surface.tide * 0.18)
                + (directSurge * 0.34)
                + (directCrest * 0.16)
                + (levelImpact * 0.18),
                2.8
            ) / 1.9
        );
        const insideOutResponse = 0.22 + (surface.outwardPulse * 0.78);
        const deformationResponse = (0.04 + (deformationActivity * 0.96)) * insideOutResponse;
        const stormDrift = (surface.lateral * 0.9) + (barDrift * 0.7);
        let maxLocalDistance = profile.radius;

        for (let index = 0; index < positionAttribute.count; index += 1) {
            const offset = index * 3;
            const normalX = baseNormals[offset];
            const normalY = baseNormals[offset + 1];
            const normalZ = baseNormals[offset + 2];
            const tangentX = baseTangents[offset];
            const tangentY = baseTangents[offset + 1];
            const tangentZ = baseTangents[offset + 2];
            const bitangentX = baseBitangents[offset];
            const bitangentY = baseBitangents[offset + 1];
            const bitangentZ = baseBitangents[offset + 2];
            const baseX = basePositions[offset];
            const baseY = basePositions[offset + 1];
            const baseZ = basePositions[offset + 2];
            const topWeight = topWeights[index];
            const equatorWeight = equatorWeights[index];
            const sideWeight = sideWeights[index];
            const bottomWeight = bottomWeights[index];
            const phase = phases[index];
            const latitude = latitudes[index];
            const spectrumValue = getSpectrumValue(audio.spectrum, spectrumOffsets[index]);
            const primarySweep = (normalX * profile.primaryWaveDirX) + (normalZ * profile.primaryWaveDirZ);
            const crossSweep = (normalX * profile.crossWaveDirX) + (normalZ * profile.crossWaveDirZ);
            const latitudeAngle = Math.asin(Math.max(-1, Math.min(1, normalY)));
            const breathWave = Math.sin(songPhase + (latitudeAngle * 0.8) + (phase * 0.12));
            const songPulseWave = Math.sin(songPhase + (primarySweep * 0.84) + (latitudeAngle * 0.46) + (phase * 0.12));
            const songMoldWave = Math.cos((songPhase * 0.92) - 0.46 + (crossSweep * 0.42) - (latitudeAngle * 0.36) + (phase * 0.08));
            let patchWeightSum = 0;
            let patchWeightedPulse = 0;
            let patchWeightedMold = 0;
            let patchWeightedDot = 0;
            let patchMaxWeight = 0;

            for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
                const patchOffset = patchIndex * 3;
                const patchDot = (normalX * patchCenters[patchOffset]) + (normalY * patchCenters[patchOffset + 1]) + (normalZ * patchCenters[patchOffset + 2]);

                const patchKernel = smoothstep(0.44, 0.96, patchDot);
                const patchWeight = Math.pow(patchKernel, 1.75);

                if (patchWeight > patchMaxWeight) {
                    patchMaxWeight = patchWeight;
                }

                patchWeightSum += patchWeight;
                patchWeightedDot += patchWeight * patchDot;
                patchWeightedPulse += patchWeight * Math.sin(songPhase + patchPhases[patchIndex] + (patchDot * 0.32) + (phase * 0.08));
                patchWeightedMold += patchWeight * Math.cos((songPhase * 0.92) - 0.42 + (patchPhases[patchIndex] * 0.62) - (latitudeAngle * 0.14) + (phase * 0.06));
            }

            const patchWeightTotal = Math.max(0.0001, patchWeightSum);
            const patchAverageDot = patchWeightedDot / patchWeightTotal;
            const patchFocus = smoothstep(0.08, 0.46, patchMaxWeight / patchWeightTotal);
            const patchPeakBase = smoothstep(0.54, 0.88, patchAverageDot);
            const patchPeakShape = clamp01((patchPeakBase * 0.94) + (patchFocus * 0.06));
            const patchPeakMask = Math.sqrt(Math.max(0, 1 - Math.pow(1 - patchPeakShape, 2)));
            const patchShoulderMask = patchPeakShape * patchPeakShape * (3 - (2 * patchPeakShape));
            const patchLiftMask = clamp01((patchPeakMask * 0.72) + (patchShoulderMask * 0.28));
            const patchArchBase = clamp01(((1 - patchFocus) * 0.38) + ((1 - patchShoulderMask) * 0.24) + ((1 - patchPeakMask) * 0.38));
            const patchConnectionShape = patchArchBase * patchArchBase * (3 - (2 * patchArchBase));
            const patchConnectionMask = clamp01((patchConnectionShape * 0.92) + ((1 - patchShoulderMask) * 0.34));
            const patchEdgeMask = smoothstep(0.02, 0.97, patchArchBase);
            const patchCavityMask = smoothstep(0.08, 0.98, patchConnectionMask * (0.48 + (patchEdgeMask * 0.52)));
            const patchPulseWave = patchWeightedPulse / patchWeightTotal;
            const patchMoldWave = patchWeightedMold / patchWeightTotal;
            const bodyDrive = clampPositive(
                (surface.swell * 0.74)
                + (surface.pulse * 0.62)
                + (surface.spread * 0.38)
                + (surface.droplet * 0.34)
                + (directSurge * 0.46)
                + (downbeatPulse * 0.22),
                4.4
            ) / 2.8;
            const shapeDrive = clampPositive(
                (surface.tide * 0.48)
                + (surface.softness * 0.34)
                + (surface.cohesion * 0.26)
                + (presence * 0.16),
                3.6
            ) / 2.4;
            const blobPulseWave = (songPulseWave * 0.34) + (patchPulseWave * 0.66);
            const blobMoldWave = (songMoldWave * 0.3) + (patchMoldWave * 0.7);
            const waveShellWeight = clamp01(0.86 + (equatorWeight * 0.08) + (sideWeight * 0.04));
            const patchTravel = clamp01((surface.corePulse * 0.32) + (surface.outwardPulse * 0.86) + (deformationActivity * 0.18));
            const waveResponse = smoothstep(
                0.06,
                0.52,
                clampPositive(
                    (surface.corePulse * 0.42)
                    + (surface.outwardPulse * 0.28)
                    + (surface.pulse * 0.22)
                    + (directSurge * 0.22)
                    + (levelImpact * 0.16),
                    1.9
                ) / 1.28
            );
            const localWaveDrive = smoothstep(0.04, 0.82, clamp01((spectrumValue * 0.72) + (waveResponse * 0.28)));
            const waveDynamic = 0.12 + (waveResponse * 0.88);
            const patchBodyMask = 0.05 + (patchLiftMask * 0.95);
            const patchLiftAmount = profile.waveAmount * (0.1 + (bodyDrive * 0.2) + (patchTravel * 0.24) + (localWaveDrive * 4.28));
            const patchRetractAmount = profile.waveAmount * (0.07 + (surface.retract * 0.38) + (patchTravel * 0.18) + (localWaveDrive * 1.62));
            const patchTroughAmount = profile.waveConnectionAmount * (0.52 + (shapeDrive * 0.62) + (patchTravel * 0.52) + (localWaveDrive * 3.96));
            const patchWaveLift = patchLiftMask * patchLiftAmount * waveShellWeight * (1.34 + (localWaveDrive * 4.06));
            const patchWaveSwing = patchLiftMask * blobPulseWave * patchRetractAmount * waveShellWeight * (0.84 + (localWaveDrive * 0.96));
            const patchWaveDepth = patchCavityMask * patchTroughAmount * waveShellWeight * (2.92 + (patchEdgeMask * 2.48) + (localWaveDrive * 1.62));
            const patchPulseAmount = (blobPulseWave * (profile.clayBodyAmount * (0.02 + (bodyDrive * 0.06) + (localWaveDrive * 0.82)) * waveShellWeight * patchBodyMask * waveDynamic))
                + (spectrumValue * profile.spectrumAmount * waveShellWeight * (0.08 + (patchBodyMask * 0.18)) * (0.18 + (localWaveDrive * 0.82)))
                + (breathWave * beatConfidence * profile.breathAmount * patchTravel * (0.01 + (patchBodyMask * 0.04)) * (0.2 + (waveDynamic * 0.8)));
            const patchContourAmount = blobMoldWave * (profile.clayContourAmount * (0.01 + (shapeDrive * 0.06) + (localWaveDrive * 0.44)) * waveShellWeight * (0.12 + (patchBodyMask * 0.72)) * (0.18 + (waveDynamic * 0.82)));
            const radialBody = patchPulseAmount + patchContourAmount + patchWaveLift + patchWaveSwing - patchWaveDepth;
            const targetRadialRaw = profile.baseSwell + radialBody;
            const targetRadial = clampRange(softLimit(targetRadialRaw, profile.radialSoftLimit + (surface.softness * 0.06)), -profile.maxRetract, profile.maxLift);
            const flowShellWeight = clamp01(0.14 + (equatorWeight * 0.86));
            const crestRoundness = 1 - (patchLiftMask * (0.28 + (localWaveDrive * 0.2)));
            const tangentFlowRaw = (((surface.lateral * stereoSigns[index] * profile.lateralAmount * sideWeight * 0.18)
                + (blobPulseWave * surface.spread * profile.pulseFlow * equatorWeight * 0.24)
                + (blobMoldWave * surface.flow * profile.sideWaveFlow * sideWeight * 0.18)) * flowShellWeight) * crestRoundness;
            const bitangentFlowRaw = (((blobMoldWave * surface.tide * profile.tideLiftAmount * (0.12 + (equatorWeight * 0.18)))
                + (((topWeight - bottomWeight) * surface.outwardPulse * profile.verticalStretch) * 0.06)) * flowShellWeight) * crestRoundness;
            const tangentFlow = softLimit(tangentFlowRaw * 0.16, profile.flowSoftLimit + (surface.softness * 0.03));
            const bitangentFlow = softLimit(bitangentFlowRaw * 0.14, profile.verticalSoftLimit + (surface.softness * 0.03));

            radialOffsets[index] = dampDirectional(radialOffsets[index], targetRadial, profile.radialAttack + (directSurge * 10.4) + (responseDrive * 6.2) + (surface.pulse * 5.2) + (surface.outwardPulse * 6.2) + (bodyDrive * 3.2), profile.radialRelease + (surface.cohesion * 2.6) + (surface.pulse * 1.6), delta);
            tangentOffsets[index] = dampDirectional(tangentOffsets[index], tangentFlow, profile.flowAttack + (surface.flow * 5.2) + (directSpread * 2.6) + (surface.pulse * 1.4), profile.flowRelease + (surface.cohesion * 1.6), delta);
            bitangentOffsets[index] = dampDirectional(bitangentOffsets[index], bitangentFlow, profile.flowAttack + (surface.tide * 4.8) + (directCrest * 2.6) + (surface.pulse * 1.2), profile.flowRelease + (surface.cohesion * 1.8), delta);
        }

        if (vertexNeighbors.length) {
            const peakSmoothingMax = Math.max(0.08, profile.maxLift * 0.32);
            const troughSmoothingMax = Math.max(0.08, profile.maxRetract * 0.24);

            for (let index = 0; index < positionAttribute.count; index += 1) {
                const neighbors = vertexNeighbors[index];

                if (!neighbors.length) {
                    smoothedRadialOffsets[index] = radialOffsets[index];
                    continue;
                }

                let neighborSum = 0;

                for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex += 1) {
                    neighborSum += radialOffsets[neighbors[neighborIndex]];
                }

                const neighborAverage = neighborSum / neighbors.length;
                const currentRadial = radialOffsets[index];
                const peakBlend = smoothstep(0.01, peakSmoothingMax, Math.max(0, currentRadial));
                const troughBlend = smoothstep(0.01, troughSmoothingMax, Math.max(0, -currentRadial));
                const smoothingTarget = currentRadial >= 0 ? neighborAverage : Math.min(currentRadial, neighborAverage);
                const smoothingStrength = currentRadial >= 0
                    ? 0.18 + (peakBlend * 0.72)
                    : 0.036 + (troughBlend * 0.09);
                let nextRadial = currentRadial + ((smoothingTarget - currentRadial) * smoothingStrength);

                if (currentRadial < 0) {
                    nextRadial = Math.min(nextRadial, currentRadial * (1.26 + (troughBlend * 0.48)));
                }

                smoothedRadialOffsets[index] = clampRange(nextRadial, -profile.maxRetract, profile.maxLift);
            }

            for (let index = 0; index < positionAttribute.count; index += 1) {
                const neighbors = vertexNeighbors[index];

                if (!neighbors.length) {
                    roundedRadialOffsets[index] = smoothedRadialOffsets[index];
                    continue;
                }

                let neighborSum = 0;

                for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex += 1) {
                    neighborSum += smoothedRadialOffsets[neighbors[neighborIndex]];
                }

                const neighborAverage = neighborSum / neighbors.length;
                const currentRadial = smoothedRadialOffsets[index];
                const peakBlend = smoothstep(0.01, peakSmoothingMax, Math.max(0, currentRadial));
                const troughBlend = smoothstep(0.01, troughSmoothingMax, Math.max(0, -currentRadial));
                const smoothingTarget = currentRadial >= 0 ? neighborAverage : Math.min(currentRadial, neighborAverage);
                const smoothingStrength = currentRadial >= 0
                    ? 0.14 + (peakBlend * 0.58)
                    : 0.024 + (troughBlend * 0.06);
                let nextRadial = currentRadial + ((smoothingTarget - currentRadial) * smoothingStrength);

                if (currentRadial < 0) {
                    nextRadial = Math.min(nextRadial, currentRadial * (1.18 + (troughBlend * 0.36)));
                }

                roundedRadialOffsets[index] = clampRange(nextRadial, -profile.maxRetract, profile.maxLift);
            }

            radialOffsets.set(roundedRadialOffsets);
        }

        maxLocalDistance = profile.radius;

        for (let index = 0; index < positionAttribute.count; index += 1) {
            const offset = index * 3;
            const normalX = baseNormals[offset];
            const normalY = baseNormals[offset + 1];
            const normalZ = baseNormals[offset + 2];
            const tangentX = baseTangents[offset];
            const tangentY = baseTangents[offset + 1];
            const tangentZ = baseTangents[offset + 2];
            const bitangentX = baseBitangents[offset];
            const bitangentY = baseBitangents[offset + 1];
            const bitangentZ = baseBitangents[offset + 2];
            const baseX = basePositions[offset];
            const baseY = basePositions[offset + 1];
            const baseZ = basePositions[offset + 2];

            surfaceSignalAttribute.array[index] = clampSigned(radialOffsets[index] / profile.surfaceSignalRange, 1);

            const nextX = baseX + (normalX * radialOffsets[index]) + (tangentX * tangentOffsets[index]) + (bitangentX * bitangentOffsets[index]);
            const nextY = baseY + (normalY * radialOffsets[index]) + (tangentY * tangentOffsets[index]) + (bitangentY * bitangentOffsets[index]);
            const nextZ = baseZ + (normalZ * radialOffsets[index]) + (tangentZ * tangentOffsets[index]) + (bitangentZ * bitangentOffsets[index]);
            const localDistance = Math.sqrt((nextX * nextX) + (nextY * nextY) + (nextZ * nextZ));

            if (localDistance > maxLocalDistance) maxLocalDistance = localDistance;

            positionAttribute.array[offset] = nextX;
            positionAttribute.array[offset + 1] = nextY;
            positionAttribute.array[offset + 2] = nextZ;
        }

        if (seamPairs.length) {
            for (let pairIndex = 0; pairIndex < seamPairs.length; pairIndex += 1) {
                const seamStartIndex = seamPairs[pairIndex][0];
                const seamEndIndex = seamPairs[pairIndex][1];
                const seamStartOffset = seamStartIndex * 3;
                const seamEndOffset = seamEndIndex * 3;
                const averagedRadial = (radialOffsets[seamStartIndex] + radialOffsets[seamEndIndex]) * 0.5;
                const averagedTangent = (tangentOffsets[seamStartIndex] + tangentOffsets[seamEndIndex]) * 0.5;
                const averagedBitangent = (bitangentOffsets[seamStartIndex] + bitangentOffsets[seamEndIndex]) * 0.5;
                const averagedX = (positionAttribute.array[seamStartOffset] + positionAttribute.array[seamEndOffset]) * 0.5;
                const averagedY = (positionAttribute.array[seamStartOffset + 1] + positionAttribute.array[seamEndOffset + 1]) * 0.5;
                const averagedZ = (positionAttribute.array[seamStartOffset + 2] + positionAttribute.array[seamEndOffset + 2]) * 0.5;
                const averagedSignal = clampSigned(averagedRadial / profile.surfaceSignalRange, 1);

                radialOffsets[seamStartIndex] = averagedRadial;
                radialOffsets[seamEndIndex] = averagedRadial;
                tangentOffsets[seamStartIndex] = averagedTangent;
                tangentOffsets[seamEndIndex] = averagedTangent;
                bitangentOffsets[seamStartIndex] = averagedBitangent;
                bitangentOffsets[seamEndIndex] = averagedBitangent;
                surfaceSignalAttribute.array[seamStartIndex] = averagedSignal;
                surfaceSignalAttribute.array[seamEndIndex] = averagedSignal;
                positionAttribute.array[seamStartOffset] = averagedX;
                positionAttribute.array[seamStartOffset + 1] = averagedY;
                positionAttribute.array[seamStartOffset + 2] = averagedZ;
                positionAttribute.array[seamEndOffset] = averagedX;
                positionAttribute.array[seamEndOffset + 1] = averagedY;
                positionAttribute.array[seamEndOffset + 2] = averagedZ;
            }
        }

        positionAttribute.needsUpdate = true;
        surfaceSignalAttribute.needsUpdate = true;
        geometry.computeVertexNormals();

        if (normalAttribute && seamPairs.length) {
            for (let pairIndex = 0; pairIndex < seamPairs.length; pairIndex += 1) {
                const seamStartIndex = seamPairs[pairIndex][0];
                const seamEndIndex = seamPairs[pairIndex][1];
                const seamStartOffset = seamStartIndex * 3;
                const seamEndOffset = seamEndIndex * 3;
                let averagedNormalX = normalAttribute.array[seamStartOffset] + normalAttribute.array[seamEndOffset];
                let averagedNormalY = normalAttribute.array[seamStartOffset + 1] + normalAttribute.array[seamEndOffset + 1];
                let averagedNormalZ = normalAttribute.array[seamStartOffset + 2] + normalAttribute.array[seamEndOffset + 2];
                const averagedNormalLength = Math.sqrt((averagedNormalX * averagedNormalX) + (averagedNormalY * averagedNormalY) + (averagedNormalZ * averagedNormalZ)) || 1;

                averagedNormalX /= averagedNormalLength;
                averagedNormalY /= averagedNormalLength;
                averagedNormalZ /= averagedNormalLength;

                normalAttribute.array[seamStartOffset] = averagedNormalX;
                normalAttribute.array[seamStartOffset + 1] = averagedNormalY;
                normalAttribute.array[seamStartOffset + 2] = averagedNormalZ;
                normalAttribute.array[seamEndOffset] = averagedNormalX;
                normalAttribute.array[seamEndOffset + 1] = averagedNormalY;
                normalAttribute.array[seamEndOffset + 2] = averagedNormalZ;
            }

            normalAttribute.needsUpdate = true;
        }

        const glowLift = clamp01((surface.pulse * 0.24) + (surface.swell * 0.14) + (directSurge * 0.1));
        const shellScale = 1;
        const stormRock = Math.sin((elapsed * profile.stormRockSpeed) + stormDrift) * surface.storm * profile.stormRockAmount;
        const stormRoll = Math.cos((elapsed * (profile.stormRockSpeed * 0.86)) - stormDrift) * surface.storm * profile.stormRollAmount;
        const manualSpin = clampSigned(state.rotationSpeed, ROTATION_SPEED_LIMIT) / ROTATION_SPEED_LIMIT;
        const spinDirection = Math.abs(manualSpin) > 0.001 ? Math.sign(manualSpin) : 1;
        const spinMagnitude = Math.abs(manualSpin);
        const spinDrive = 0.58 + (spinMagnitude * 1.22);
        const spinVelocityY = (profile.spinY + (mids * 0.08) + (surface.drift * 0.05)) * spinDrive * spinDirection;
        const spinVelocityX = ((profile.spinY * 0.34) + (surface.flow * 0.04) + (surface.pulse * 0.026) + 0.014) * (0.58 + (spinMagnitude * 0.94)) * spinDirection;
        const spinVelocityZ = ((profile.spinY * 0.28) + (highs * 0.05) + (surface.ripple * 0.024) + 0.012) * (0.52 + (spinMagnitude * 0.88)) * spinDirection;
        const wobbleX = (Math.sin(elapsed * profile.tiltSpeed) * (profile.tiltAmount + (surface.buoyancy * 0.04))) + (surface.lateral * 0.08) + stormRock;
        const wobbleZ = (surface.lateral * 0.11) + (Math.sin((elapsed * profile.tiltSpeed * 0.72) + 1.1) * (profile.rollAmount + (surface.ripple * 0.02))) + stormRoll;

        rotationState.x += delta * spinVelocityX;
        rotationState.y += delta * spinVelocityY;
        rotationState.z += delta * spinVelocityZ;

        group.rotation.x = rotationState.x + wobbleX;
        group.rotation.y = rotationState.y;
        group.rotation.z = rotationState.z + wobbleZ;

        shell.scale.setScalar(shellScale);
        shellOcclusion.scale.setScalar(shellScale * 1.035);

        framing.radius = Math.max(profile.radius, maxLocalDistance * shellScale);
        framing.padding = profile.framingPadding;
        framing.surfaceGap = profile.cameraSurfaceGap;

        innerCore.scale.setScalar(0.8 + (surface.corePulse * 0.16) + (surface.outwardPulse * 0.06) + (surface.swell * 0.04));
        innerCore.position.y = (surface.buoyancy * 0.08) + (surface.droplet * 0.08) + (directSurge * 0.06) - (surface.retract * 0.02);
        innerCore.rotation.y -= delta * (0.2 + (surface.drift * 0.5));
        innerCore.rotation.x = Math.sin(elapsed * 0.72) * 0.08;

        shellMaterial.emissiveIntensity = 0.04 + (glowLift * 0.1) + (surface.pulse * 0.05) + (directRipples * 0.03);
        shellMaterial.opacity = 1;
        innerMaterial.opacity = 0.04 + (surface.swell * 0.04) + (surface.pulse * 0.03) + (directSurge * 0.02);
        innerMaterial.emissiveIntensity = 0.04 + (surface.swell * 0.08) + (surface.pulse * 0.06) + (directSurge * 0.04);

        particles.update(elapsed, {
            ...audio,
            level: Math.min(1.35, (level * 0.78) + (surface.pulse * 0.3) + (directSurge * 0.12)),
            bass: Math.min(1.35, (bass * 0.74) + (surface.swell * 0.26) + (directSurge * 0.14)),
            highs: Math.min(1.35, (highs * 0.68) + (surface.gloss * 0.2) + (directRipples * 0.12)),
            presence: Math.min(1.5, clampPositive(audio.presence, 1.5) + (surface.buoyancy * 0.22)),
            responseDrive: Math.min(1, (responseDrive * 0.84) + (surface.gloss * 0.16) + (directSurge * 0.08)),
            stereoPan: surface.lateral
        });
    }

    return {
        group,
        particleLayer: particles.points,
        applyTheme,
        update,
        getFramingState: function() {
            return framing;
        }
    };
}

function getModeProfiles() {
    return {
        v1: {
            radius: 1.32,
            geometryFactory: function() { return new THREE.IcosahedronGeometry(1.32, 5); },
            roughness: 1,
            clearcoatRoughness: 1,
            transmission: 0,
            thickness: 0,
            particleCount: 260,
            particleSize: 0.032,
            baseSwell: 0.028,
            directSwell: 0.18,
            directTopSwell: 0.08,
            directEquatorSwell: 0.05,
            spreadAmount: 0.14,
            spreadEquatorAmount: 0.16,
            spreadSideAmount: 0.12,
            swellAmount: 0.22,
            topBiasSwell: 0.08,
            pulseAmount: 0.24,
            equatorPulse: 0.12,
            spectrumAmount: 0.032,
            breathAmount: 0.048,
            retractAmount: 0.05,
            equatorRetract: 0.028,
            bottomRetract: 0.02,
            retractSharpness: 0.04,
            topStretch: 0.18,
            bottomDraw: 0.08,
            breathStretch: 0.08,
            hitStretch: 0.13,
            hitDraw: 0.06,
            wrapAmount: 0.08,
            tideAmount: 0.104,
            currentAmount: 0.074,
            cohesionAmount: 0.046,
            stormAmount: 0.142,
            crossStormAmount: 0.03,
            stormChopAmount: 0.004,
            stormTroughAmount: 0.18,
            crossStormTroughAmount: 0.064,
            valleyAmount: 0.164,
            waveCount: 25,
            waveLatitudeFrequency: 2,
            waveAmount: 1.02,
            waveConnectionAmount: 2.18,
            clayBodyAmount: 0.198,
            clayContourAmount: 0.088,
            clayCompressionAmount: 0.226,
            lobeAmount: 0.028,
            rippleAmount: 0.0048,
            crestAmount: 0.006,
            maxLift: 3.9,
            maxRetract: 3.84,
            radialSoftLimit: 3.72,
            surfaceSignalRange: 0.24,
            baseWaveContrast: 0.62,
            stormWaveContrastBoost: 0.22,
            flowWaveContrastBoost: 0.12,
            chopWaveContrastBoost: 0.08,
            waveGain: 0.12,
            flowAmount: 0.056,
            currentFlowAmount: 0.03,
            cohesionFlowAmount: 0.022,
            stormFlowAmount: 0.034,
            crossStormFlowAmount: 0.016,
            lateralAmount: 0.084,
            pulseFlow: 0.012,
            sideWaveFlow: 0.004,
            verticalAmount: 0.032,
            verticalStretch: 0.026,
            hitVerticalStretch: 0.032,
            flowSoftLimit: 0.086,
            verticalSoftLimit: 0.076,
            tideLiftAmount: 0.034,
            stormLiftAmount: 0.056,
            crossStormLiftAmount: 0.022,
            flowSinkAmount: 0.014,
            bottomSink: 0.032,
            bodyScale: 0.28,
            bodySpreadScale: 0.24,
            bodyStretch: 0.3,
            bodyTideScale: 0.06,
            directStretch: 0.24,
            spreadBalance: 0.08,
            hitStretchScale: 0.2,
            wrapLift: 0.16,
            framingPadding: 1.12,
            cameraSurfaceGap: 1.28,
            radialAttack: 26,
            radialRelease: 10.6,
            flowAttack: 14.2,
            flowRelease: 6.2,
            primaryWaveDirX: Math.cos(0.42),
            primaryWaveDirZ: Math.sin(0.42),
            crossWaveDirX: Math.cos(1.18),
            crossWaveDirZ: Math.sin(1.18),
            diagonalWaveDirX: Math.cos(2.26),
            diagonalWaveDirZ: Math.sin(2.26),
            lobeSpeed: 1.02,
            lobeFrequency: 1.48,
            rippleSpeed: 0.94,
            rippleFrequency: 1.62,
            rippleLatitudeFrequency: 1.18,
            crestSpeed: 0.84,
            crestDirectionFrequency: 0.92,
            crestLatitudeFrequency: 1.26,
            driftSpeed: 0.94,
            driftFrequency: 2.18,
            verticalSpeed: 1.56,
            tideSpeed: 0.72,
            tideFrequency: 1.46,
            tideLatitudeFrequency: 1.14,
            currentSpeed: 1.02,
            currentFrequency: 1.44,
            currentLatitudeFrequency: 1.18,
            shellSpeed: 0.74,
            shellFrequency: 0.74,
            shellLatitudeFrequency: 0.94,
            stormSpeed: 0.58,
            stormFrequency: 0.92,
            stormLatitudeFrequency: 0.64,
            crossStormSpeed: 0.82,
            crossStormFrequency: 0.98,
            crossStormLatitudeFrequency: 0.74,
            stormChopSpeed: 0.9,
            stormChopFrequency: 1.22,
            stormChopLatitudeFrequency: 0.82,
            stormRockSpeed: 0.54,
            stormRockAmount: 0.056,
            stormRollAmount: 0.046,
            spinY: 0.12,
            tiltSpeed: 0.48,
            tiltAmount: 0.05,
            rollAmount: 0.03
        },
        v2: {
            radius: 1.16,
            geometryFactory: function() { return new THREE.IcosahedronGeometry(1.16, 5); },
            roughness: 0.98,
            clearcoatRoughness: 1,
            transmission: 0,
            thickness: 0,
            particleCount: 220,
            particleSize: 0.028,
            baseSwell: 0.02,
            directSwell: 0.14,
            directTopSwell: 0.06,
            directEquatorSwell: 0.04,
            spreadAmount: 0.16,
            spreadEquatorAmount: 0.18,
            spreadSideAmount: 0.14,
            swellAmount: 0.18,
            topBiasSwell: 0.06,
            pulseAmount: 0.26,
            equatorPulse: 0.08,
            spectrumAmount: 0.034,
            breathAmount: 0.036,
            retractAmount: 0.056,
            equatorRetract: 0.034,
            bottomRetract: 0.024,
            retractSharpness: 0.048,
            topStretch: 0.14,
            bottomDraw: 0.06,
            breathStretch: 0.056,
            hitStretch: 0.1,
            hitDraw: 0.05,
            wrapAmount: 0.1,
            tideAmount: 0.094,
            currentAmount: 0.078,
            cohesionAmount: 0.048,
            stormAmount: 0.128,
            crossStormAmount: 0.032,
            stormChopAmount: 0.0048,
            stormTroughAmount: 0.154,
            crossStormTroughAmount: 0.058,
            valleyAmount: 0.142,
            waveCount: 25,
            waveLatitudeFrequency: 2,
            waveAmount: 0.86,
            waveConnectionAmount: 1.24,
            clayBodyAmount: 0.178,
            clayContourAmount: 0.082,
            clayCompressionAmount: 0.196,
            lobeAmount: 0.026,
            rippleAmount: 0.0052,
            crestAmount: 0.0062,
            maxLift: 3.3,
            maxRetract: 2.02,
            radialSoftLimit: 2.76,
            surfaceSignalRange: 0.22,
            baseWaveContrast: 0.58,
            stormWaveContrastBoost: 0.24,
            flowWaveContrastBoost: 0.12,
            chopWaveContrastBoost: 0.08,
            waveGain: 0.11,
            flowAmount: 0.062,
            currentFlowAmount: 0.034,
            cohesionFlowAmount: 0.024,
            stormFlowAmount: 0.038,
            crossStormFlowAmount: 0.018,
            lateralAmount: 0.09,
            pulseFlow: 0.013,
            sideWaveFlow: 0.0044,
            verticalAmount: 0.034,
            verticalStretch: 0.024,
            hitVerticalStretch: 0.028,
            flowSoftLimit: 0.078,
            verticalSoftLimit: 0.07,
            tideLiftAmount: 0.03,
            stormLiftAmount: 0.058,
            crossStormLiftAmount: 0.024,
            flowSinkAmount: 0.016,
            bottomSink: 0.028,
            bodyScale: 0.24,
            bodySpreadScale: 0.26,
            bodyStretch: 0.24,
            bodyTideScale: 0.056,
            directStretch: 0.18,
            spreadBalance: 0.1,
            hitStretchScale: 0.16,
            wrapLift: 0.18,
            framingPadding: 1.12,
            cameraSurfaceGap: 1.18,
            radialAttack: 27,
            radialRelease: 11,
            flowAttack: 15,
            flowRelease: 6.4,
            primaryWaveDirX: Math.cos(0.54),
            primaryWaveDirZ: Math.sin(0.54),
            crossWaveDirX: Math.cos(1.34),
            crossWaveDirZ: Math.sin(1.34),
            diagonalWaveDirX: Math.cos(2.48),
            diagonalWaveDirZ: Math.sin(2.48),
            lobeSpeed: 1.18,
            lobeFrequency: 1.58,
            rippleSpeed: 1,
            rippleFrequency: 1.74,
            rippleLatitudeFrequency: 1.3,
            crestSpeed: 0.88,
            crestDirectionFrequency: 0.98,
            crestLatitudeFrequency: 1.36,
            driftSpeed: 1,
            driftFrequency: 2.34,
            verticalSpeed: 1.84,
            tideSpeed: 0.84,
            tideFrequency: 1.62,
            tideLatitudeFrequency: 1.28,
            currentSpeed: 1.18,
            currentFrequency: 1.56,
            currentLatitudeFrequency: 1.22,
            shellSpeed: 0.8,
            shellFrequency: 0.78,
            shellLatitudeFrequency: 0.96,
            stormSpeed: 0.66,
            stormFrequency: 0.98,
            stormLatitudeFrequency: 0.72,
            crossStormSpeed: 0.92,
            crossStormFrequency: 1.02,
            crossStormLatitudeFrequency: 0.76,
            stormChopSpeed: 0.94,
            stormChopFrequency: 1.28,
            stormChopLatitudeFrequency: 0.86,
            stormRockSpeed: 0.62,
            stormRockAmount: 0.06,
            stormRollAmount: 0.05,
            spinY: 0.16,
            tiltSpeed: 0.72,
            tiltAmount: 0.04,
            rollAmount: 0.05
        }
    };
}

function ensureScene(canvas) {
    if (!canvas) return;
    if (refs.renderer && refs.canvas === canvas) return;

    refs.canvas = canvas;
    refs.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    refs.renderer.outputColorSpace = THREE.SRGBColorSpace;
    refs.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    refs.renderer.toneMappingExposure = 1;

    refs.scene = new THREE.Scene();
    refs.scene.fog = new THREE.FogExp2(getColor(state.theme.background, DEFAULT_THEME.background), 0.15);
    refs.camera = new THREE.PerspectiveCamera(refs.runtime.fov, 1, 0.1, 40);
    refs.root = new THREE.Group();
    refs.scene.add(refs.root);

    refs.lights.ambient = new THREE.AmbientLight(getColor(state.theme.primary, DEFAULT_THEME.primary), 0.76);
    refs.lights.key = new THREE.PointLight(getColor(state.theme.secondary, DEFAULT_THEME.secondary), 1.3, 30, 2);
    refs.lights.rim = new THREE.PointLight(getColor(state.theme.highlight, DEFAULT_THEME.highlight), 1.56, 30, 2);
    refs.lights.waveAccentTarget = new THREE.Object3D();
    refs.lights.waveAccentTarget.position.set(0, 0.12, 0);
    refs.lights.waveAccent = new THREE.SpotLight(getColor(state.theme.highlight, DEFAULT_THEME.highlight), 7.8, 58, Math.PI * 0.36, 0.82, 0.92);
    refs.lights.waveAccent.position.set(-4.8, 3.8, 5.8);
    refs.lights.waveAccent.castShadow = false;
    refs.lights.waveAccent.target = refs.lights.waveAccentTarget;
    refs.scene.add(refs.lights.ambient);
    refs.scene.add(refs.lights.key);
    refs.scene.add(refs.lights.rim);
    refs.scene.add(refs.lights.waveAccent);
    refs.scene.add(refs.lights.waveAccentTarget);

    const profiles = getModeProfiles();
    refs.modes.v1 = createLiquidSphereMode(profiles.v1);
    refs.modes.v2 = createLiquidSphereMode(profiles.v2);
    refs.root.add(refs.modes.v1.group);
    refs.root.add(refs.modes.v1.particleLayer);
    refs.root.add(refs.modes.v2.group);
    refs.root.add(refs.modes.v2.particleLayer);

    applyTheme();
    updateModeVisibility();
    resize();
}

function updateModeVisibility() {
    MODE_IDS.forEach(function(modeId) {
        if (!refs.modes[modeId]) return;
        refs.modes[modeId].group.visible = modeId === state.mode;
        refs.modes[modeId].particleLayer.visible = modeId === state.mode;
    });
}

function applyTheme() {
    if (!refs.scene || !refs.renderer) return;

    const background = getColor(state.theme.background, DEFAULT_THEME.background);
    refs.renderer.setClearColor(background, 1);
    if (refs.scene.fog) refs.scene.fog.color.copy(background);

    if (refs.lights.ambient) refs.lights.ambient.color.copy(getColor(state.theme.primary, DEFAULT_THEME.primary));
    if (refs.lights.key) refs.lights.key.color.copy(getColor(state.theme.secondary, DEFAULT_THEME.secondary));
    if (refs.lights.rim) refs.lights.rim.color.copy(getColor(state.theme.highlight, DEFAULT_THEME.highlight));
    if (refs.lights.waveAccent) refs.lights.waveAccent.color.copy(getColor(state.theme.highlight, DEFAULT_THEME.highlight));

    MODE_IDS.forEach(function(modeId) {
        if (!refs.modes[modeId]) return;
        refs.modes[modeId].applyTheme(state.theme);
    });
}

function resize() {
    if (!refs.renderer || !refs.camera || !refs.canvas) return;

    const rect = refs.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(refs.canvas.clientWidth || refs.canvas.offsetWidth || rect.width || 1));
    const height = Math.max(1, Math.round(refs.canvas.clientHeight || refs.canvas.offsetHeight || rect.height || 1));
    if (refs.size.width === width && refs.size.height === height) return;

    refs.size.width = width;
    refs.size.height = height;
    refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    refs.renderer.setSize(width, height, false);
    refs.camera.aspect = width / height;
    refs.camera.updateProjectionMatrix();
}

function updateLighting(elapsed) {
    if (!refs.lights.ambient || !refs.lights.key || !refs.lights.rim || !refs.lights.waveAccent || !refs.lights.waveAccentTarget || !refs.camera) return;

    const level = clampPositive(state.audio.level, 1.35);
    const bass = clampPositive(state.audio.bass, 1.35);
    const mids = clampPositive(state.audio.mids, 1.35);
    const highs = clampPositive(state.audio.highs, 1.35);
    const presence = clampPositive(state.audio.presence, 1.5) / 1.5;
    const responseDrive = clamp01(state.audio.responseDrive);
    const levelImpact = clampPositive(state.audio.levelImpact, 2.5) / 2.5;

    if (refs.scene.fog) {
        refs.scene.fog.density = 0.07 + (level * 0.01) + (presence * 0.007) + (responseDrive * 0.005);
    }

    refs.lights.ambient.intensity = 0.26 + (level * 0.08) + (presence * 0.04);
    refs.lights.key.intensity = 0.84 + (bass * 0.26) + (levelImpact * 0.28);
    refs.lights.rim.intensity = 1 + (highs * 0.52) + (responseDrive * 0.18);

    refs.lights.key.position.set(
        Math.cos(elapsed * 0.34) * 4.2,
        2.1 + (bass * 1.05),
        Math.sin(elapsed * 0.34) * 4.2
    );
    refs.lights.rim.position.set(
        -refs.camera.position.x * 0.38,
        1.64 + (highs * 1.2) + (presence * 0.24),
        -refs.camera.position.z * 0.38
    );

    refs.lights.waveAccent.intensity = 7.9 + (presence * 2.2) + (responseDrive * 1.5) + (levelImpact * 2.3);
    refs.lights.waveAccent.distance = 58;
    refs.lights.waveAccent.angle = 1.08;
    refs.lights.waveAccent.penumbra = 0.86;
    refs.lights.waveAccent.decay = 0.9;
    waveAccentLeft.set(-1, 0, 0).applyQuaternion(refs.camera.quaternion);
    waveAccentUp.set(0, 1, 0).applyQuaternion(refs.camera.quaternion);
    refs.camera.getWorldDirection(waveAccentForward);
    waveAccentAnchor.copy(refs.camera.position)
        .addScaledVector(waveAccentLeft, 2.84 + (mids * 0.16))
        .addScaledVector(waveAccentUp, 2.52 + (presence * 0.18))
        .addScaledVector(waveAccentForward, 0.18);
    refs.lights.waveAccent.position.copy(waveAccentAnchor);
}

function updateCamera(delta, elapsed, activeMode) {
    if (!refs.camera) return;

    const level = clampPositive(state.audio.level, 1.35);
    const bass = clampPositive(state.audio.bass, 1.35);
    const mids = clampPositive(state.audio.mids, 1.35);
    const highs = clampPositive(state.audio.highs, 1.35);
    const kick = clampPositive(state.audio.kick, 1.5) / 1.5;
    const snare = clampPositive(state.audio.snare, 1.5) / 1.5;
    const presence = clampPositive(state.audio.presence, 1.5) / 1.5;
    const stereoWidth = clampPositive(state.audio.stereoWidth, 1.3) / 1.3;
    const stereoPan = clampSigned(state.audio.stereoPan, 1);
    const stereoMotion = clampPositive(state.audio.stereoMotion, 1.5) / 1.5;
    const levelImpact = clampPositive(state.audio.levelImpact, 2.5) / 2.5;
    const kickImpact = clampPositive(state.audio.kickImpact || state.audio.bassImpact, 2.5) / 2.5;
    const snareImpact = clampPositive(state.audio.snareImpact || state.audio.midsImpact, 2.5) / 2.5;
    const highsImpact = clampPositive(state.audio.highsImpact || state.audio.hatImpact, 2.5) / 2.5;
    const beatPulse = clampPositive(state.audio.beatPulse, 1.5) / 1.5;
    const downbeatPulse = clampPositive(state.audio.downbeatPulse, 1.5) / 1.5;
    const beatConfidence = clamp01(state.audio.beatConfidence);
    const barPhase = clamp01(state.audio.barPhase);
    const barDrift = clampSigned(state.audio.barDrift, 1);
    const responseDrive = clamp01(state.audio.responseDrive);
    const surfaceDrive = clampPositive(state.audio.surfaceDrive, 2.4);
    const cameraDrive = clampPositive(state.audio.cameraDrive, 2.4);
    const intimacyDrive = clampPositive(state.audio.intimacyDrive, 2.2);
    const manualOrbit = clampSigned(state.rotationSpeed, ROTATION_SPEED_LIMIT) / ROTATION_SPEED_LIMIT;
    const framingState = activeMode && typeof activeMode.getFramingState === 'function'
        ? activeMode.getFramingState()
        : null;
    const subjectRadius = Math.max(1.35, framingState && Number.isFinite(framingState.radius) ? framingState.radius : 1.8);
    const framingPadding = framingState && Number.isFinite(framingState.padding) ? framingState.padding : 1.12;
    const surfaceGap = framingState && Number.isFinite(framingState.surfaceGap) ? framingState.surfaceGap : 1.2;
    const phraseBreath = Math.sin((barPhase * Math.PI * 2) - (Math.PI * 0.5));
    const zoomPulseTarget = clampRange((kickImpact * 1.46) + (downbeatPulse * 0.92) + (levelImpact * 0.42) + (kick * 0.38), 0, 2.2);
    const zoomBreathTarget = clampRange((bass * 0.08) + (presence * 0.04) + (beatPulse * 0.04), 0, 0.22);
    const zoomMotionTarget = clampRange(
        (kickImpact * 1.12)
        + (snareImpact * 0.52)
        + (highsImpact * 0.22)
        + (downbeatPulse * 0.34)
        + (beatPulse * 0.18)
        + (levelImpact * 0.16),
        0,
        2.4
    );
    const zoomDriftTarget = 0;
    const swayXTarget = clampSigned((stereoPan * (0.18 + (stereoWidth * 0.18))) + (barDrift * 0.12) + (stereoMotion * 0.05 * Math.sin(elapsed * 1.2)), 0.55);
    const swayYTarget = clampRange((snareImpact * 0.12) + (presence * 0.06) + (Math.max(0, phraseBreath) * zoomBreathTarget * 0.08), -0.2, 0.28);

    refs.runtime.zoomPulse = dampDirectional(refs.runtime.zoomPulse, zoomPulseTarget, 36 + (cameraDrive * 14), 15 + (cameraDrive * 5.4), delta);
    refs.runtime.zoomBreath = dampDirectional(refs.runtime.zoomBreath, zoomBreathTarget, 10 + (cameraDrive * 4), 7.2 + (cameraDrive * 2.4), delta);
    refs.runtime.zoomMotion = dampDirectional(refs.runtime.zoomMotion, zoomMotionTarget, 26 + (cameraDrive * 10.8), 12.4 + (cameraDrive * 4.8), delta);
    refs.runtime.zoomDrift = dampDirectional(refs.runtime.zoomDrift, zoomDriftTarget, 12, 10, delta);
    refs.runtime.swayX = dampDirectional(refs.runtime.swayX, swayXTarget, 6 + (cameraDrive * 3.4), 4.4 + (cameraDrive * 1.6), delta);
    refs.runtime.swayY = dampDirectional(refs.runtime.swayY, swayYTarget, 5.4 + (cameraDrive * 3), 4 + (cameraDrive * 1.4), delta);

    refs.runtime.orbitAngle += delta * (0.22 + (mids * 0.24) + (highs * 0.08) + (manualOrbit * 0.95));

    const impactMix = (levelImpact * 0.55) + (kickImpact * 0.45) + (downbeatPulse * 0.25);
    const zoomPunch = (refs.runtime.zoomPulse * (1.48 + (cameraDrive * 0.18)))
        + (refs.runtime.zoomMotion * (0.92 + (cameraDrive * 0.12)));
    const zoomRelax = refs.runtime.zoomBreath * (0.26 + (beatConfidence * 0.04));
    let distanceTarget = clampRange(16 - (zoomPunch * 1.42) + (zoomRelax * 0.22) - (impactMix * 0.08 * cameraDrive) + (stereoWidth * 0.08), 2.9, 7.8);
    const fovTarget = clampRange(
        50.5
        - (zoomPunch * 6.8)
        + (zoomRelax * 1.2),
        39,
        55
    );
    const heightTarget = clampRange(0.24 + (bass * 0.62 * surfaceDrive) + (presence * 0.34 * intimacyDrive) + (downbeatPulse * 0.16), 0.12, 1.85);
    const lookYTarget = clampRange(0.08 + (level * 0.18) + (presence * 0.28 * intimacyDrive) + (kickImpact * 0.12) + (responseDrive * 0.06), 0.04, 0.96);
    const recoilTarget = (impactMix * 0.44 * cameraDrive) + (kickImpact * 0.18) + (refs.runtime.zoomPulse * 0.26) + (Math.max(0, refs.runtime.zoomMotion) * 0.12);
    const minFramingDistance = getMinimumFramingDistance(subjectRadius, fovTarget, refs.camera.aspect || 1, framingPadding);
    const minSurfaceDistance = subjectRadius + surfaceGap;
    const minimumCenterDistance = Math.max(minFramingDistance, minSurfaceDistance) + (recoilTarget * 0.45);

    distanceTarget = Math.max(distanceTarget, minimumCenterDistance);

    refs.runtime.distance = dampDirectional(refs.runtime.distance, distanceTarget, 38 + (cameraDrive * 12), 18 + (cameraDrive * 6.8), delta);
    refs.runtime.fov = dampDirectional(refs.runtime.fov, fovTarget, 34 + (cameraDrive * 12), 20 + (cameraDrive * 7.6), delta);
    refs.runtime.height = damp(refs.runtime.height, heightTarget, 4.8 + (surfaceDrive * 1.4), delta);
    refs.runtime.lookY = damp(refs.runtime.lookY, lookYTarget, 5.4 + (intimacyDrive * 1.8), delta);
    refs.runtime.recoil = damp(refs.runtime.recoil, recoilTarget, recoilTarget > refs.runtime.recoil ? 12 : 6, delta);

    refs.camera.fov = refs.runtime.fov;
    refs.camera.updateProjectionMatrix();

    const orbitRadius = Math.max(Math.max(minFramingDistance, minSurfaceDistance), refs.runtime.distance - (refs.runtime.recoil * 0.45));
    refs.camera.position.x = (Math.cos(refs.runtime.orbitAngle) * orbitRadius) + (stereoPan * 0.42) + refs.runtime.swayX;
    refs.camera.position.y = refs.runtime.height + (Math.sin((refs.runtime.orbitAngle * 0.65) + (elapsed * 0.24)) * (0.22 + (level * 0.12))) + refs.runtime.swayY;
    refs.camera.position.z = Math.sin(refs.runtime.orbitAngle) * orbitRadius;
    const lookTargetX = (stereoPan * 0.08) + (refs.runtime.swayX * 0.12);
    const lookTargetY = refs.runtime.lookY + (refs.runtime.swayY * 0.24);
    refs.camera.lookAt(lookTargetX, lookTargetY, 0);
    refs.camera.updateMatrixWorld();

    if (activeMode && activeMode.particleLayer) {
        particleLookTarget.set(lookTargetX, lookTargetY, 0);
        refs.camera.getWorldDirection(particleForward);
        const particleDistanceTarget = minSurfaceDistance + (subjectRadius * 0.28);

        refs.runtime.particleDistance = damp(
            refs.runtime.particleDistance,
            particleDistanceTarget,
            8.6,
            delta
        );

        particleAnchor.copy(refs.camera.position).addScaledVector(particleForward, refs.runtime.particleDistance);
        activeMode.particleLayer.position.copy(particleAnchor);
        activeMode.particleLayer.quaternion.copy(refs.camera.quaternion);
    }
}

function renderFrame(timestamp) {
    if (!refs.renderer || !refs.scene || !refs.camera) return;

    const delta = refs.lastTimestamp
        ? Math.min(0.05, Math.max(0.001, (timestamp - refs.lastTimestamp) / 1000))
        : (1 / 60);
    refs.lastTimestamp = timestamp;

    const activeMode = refs.modes[state.mode] || refs.modes[DEFAULT_MODE];
    if (activeMode) {
        activeMode.update(timestamp / 1000, delta, state.audio);
    }

    resize();
    updateCamera(delta, timestamp / 1000, activeMode);
    updateLighting(timestamp / 1000);

    refs.renderer.render(refs.scene, refs.camera);
    refs.animationFrameId = requestAnimationFrame(renderFrame);
}

function start(canvas) {
    ensureScene(canvas);
    updateModeVisibility();
    if (refs.animationFrameId) return;
    refs.lastTimestamp = 0;
    refs.animationFrameId = requestAnimationFrame(renderFrame);
}

function stop() {
    if (refs.animationFrameId) {
        cancelAnimationFrame(refs.animationFrameId);
        refs.animationFrameId = 0;
    }
    refs.lastTimestamp = 0;
}

async function prime(canvas) {
    ensureScene(canvas);
    updateModeVisibility();
    resize();
    const activeMode = refs.modes[state.mode] || refs.modes[DEFAULT_MODE];
    if (activeMode) activeMode.update(0, 1 / 60, state.audio);
    updateCamera(1 / 60, 0, activeMode);
    updateLighting(0);
    if (refs.renderer && refs.scene && refs.camera) {
        refs.renderer.render(refs.scene, refs.camera);
    }
}

function setMode(mode) {
    state.mode = MODE_IDS.includes(mode) ? mode : DEFAULT_MODE;
    updateModeVisibility();
}

function setTheme(theme) {
    state.theme = {
        ...DEFAULT_THEME,
        ...(theme || {})
    };
    applyTheme();
}

function setRotationSpeed(value) {
    state.rotationSpeed = clampSigned(value, ROTATION_SPEED_LIMIT);
}

function setAudioData(data) {
    if (!data || typeof data !== 'object') return;
    state.audio.level = data.level !== undefined ? clampPositive(data.level, 1.35) : state.audio.level;
    state.audio.bass = data.bass !== undefined ? clampPositive(data.bass, 1.35) : state.audio.bass;
    state.audio.mids = data.mids !== undefined ? clampPositive(data.mids, 1.35) : state.audio.mids;
    state.audio.highs = data.highs !== undefined ? clampPositive(data.highs, 1.35) : state.audio.highs;
    state.audio.levelImpact = data.levelImpact !== undefined ? clampPositive(data.levelImpact, 2.5) : state.audio.levelImpact;
    state.audio.bassImpact = data.bassImpact !== undefined ? clampPositive(data.bassImpact, 2.5) : state.audio.bassImpact;
    state.audio.midsImpact = data.midsImpact !== undefined ? clampPositive(data.midsImpact, 2.5) : state.audio.midsImpact;
    state.audio.highsImpact = data.highsImpact !== undefined ? clampPositive(data.highsImpact, 2.5) : state.audio.highsImpact;
    state.audio.kick = data.kick !== undefined ? clampPositive(data.kick, 1.5) : state.audio.kick;
    state.audio.snare = data.snare !== undefined ? clampPositive(data.snare, 1.5) : state.audio.snare;
    state.audio.hat = data.hat !== undefined ? clampPositive(data.hat, 1.5) : state.audio.hat;
    state.audio.kickImpact = data.kickImpact !== undefined ? clampPositive(data.kickImpact, 2.5) : state.audio.kickImpact;
    state.audio.snareImpact = data.snareImpact !== undefined ? clampPositive(data.snareImpact, 2.5) : state.audio.snareImpact;
    state.audio.hatImpact = data.hatImpact !== undefined ? clampPositive(data.hatImpact, 2.5) : state.audio.hatImpact;
    state.audio.presence = data.presence !== undefined ? clampPositive(data.presence, 1.5) : state.audio.presence;
    state.audio.stereoWidth = data.stereoWidth !== undefined ? clampPositive(data.stereoWidth, 1.3) : state.audio.stereoWidth;
    state.audio.stereoPan = data.stereoPan !== undefined ? clampSigned(data.stereoPan, 1) : state.audio.stereoPan;
    state.audio.stereoMotion = data.stereoMotion !== undefined ? clampPositive(data.stereoMotion, 1.5) : state.audio.stereoMotion;
    state.audio.beatPulse = data.beatPulse !== undefined ? clampPositive(data.beatPulse, 1.5) : state.audio.beatPulse;
    state.audio.downbeatPulse = data.downbeatPulse !== undefined ? clampPositive(data.downbeatPulse, 1.5) : state.audio.downbeatPulse;
    state.audio.beatConfidence = data.beatConfidence !== undefined ? clamp01(data.beatConfidence) : state.audio.beatConfidence;
    state.audio.barPhase = data.barPhase !== undefined ? clamp01(data.barPhase) : state.audio.barPhase;
    state.audio.barDrift = data.barDrift !== undefined ? clampSigned(data.barDrift, 1) : state.audio.barDrift;
    state.audio.responseDrive = data.responseDrive !== undefined ? clamp01(data.responseDrive) : state.audio.responseDrive;
    state.audio.surfaceDrive = data.surfaceDrive !== undefined ? clampPositive(data.surfaceDrive, 2.4) : state.audio.surfaceDrive;
    state.audio.cameraDrive = data.cameraDrive !== undefined ? clampPositive(data.cameraDrive, 2.4) : state.audio.cameraDrive;
    state.audio.intimacyDrive = data.intimacyDrive !== undefined ? clampPositive(data.intimacyDrive, 2.2) : state.audio.intimacyDrive;
    state.audio.spectrum = Array.isArray(data.spectrum) ? data.spectrum : state.audio.spectrum;
}

function setAudioLevel(level) {
    setAudioData({
        level,
        bass: 0,
        mids: 0,
        highs: 0,
        levelImpact: 0,
        bassImpact: 0,
        midsImpact: 0,
        highsImpact: 0,
        kick: 0,
        snare: 0,
        hat: 0,
        kickImpact: 0,
        snareImpact: 0,
        hatImpact: 0,
        presence: 0,
        stereoWidth: 0,
        stereoPan: 0,
        stereoMotion: 0,
        beatPulse: 0,
        downbeatPulse: 0,
        beatConfidence: 0,
        barPhase: 0,
        barDrift: 0,
        responseDrive: 0,
        surfaceDrive: 1,
        cameraDrive: 1,
        intimacyDrive: 1,
        spectrum: []
    });
}

window.threeVisualizer = {
    start,
    prime,
    stop,
    resize,
    setMode,
    setTheme,
    setRotationSpeed,
    setAudioData,
    setAudioLevel
};