(function() {
    const DEFAULT_THEME = {
        primary: '#8fe8ff',
        secondary: '#2bd9ff',
        accent: '#5a86ff',
        highlight: '#9ad8ff',
        background: '#05070d'
    }
    const RESPONSE_MAX = 500
    const RAINBOW_DEGREES_PER_SECOND = 20
    const SPECTRUM_BUCKET_COUNT = 48

    function clampRange(value, min, max) {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) return min
        return Math.max(min, Math.min(max, numeric))
    }

    function clampSigned(value, limit) {
        const safeLimit = Math.max(0, Number(limit) || 0)
        return clampRange(value, -safeLimit, safeLimit)
    }

    function randomBetween(min, max) {
        return min + (Math.random() * (max - min))
    }

    function followValue(current, target, deltaSeconds, attack, release) {
        const rate = target > current ? attack : release
        const clampedRate = Math.max(0.01, Number(rate) || 0.01)
        const delta = Math.max(0.001, Number(deltaSeconds) || (1 / 60))
        const blend = 1 - Math.exp(-delta * clampedRate)
        return current + ((target - current) * blend)
    }

    function normalizeHue(value) {
        return ((Number(value) % 360) + 360) % 360
    }

    function hslToHex(hue, saturation, lightness) {
        const h = normalizeHue(hue)
        const s = clampRange(saturation, 0, 100) / 100
        const l = clampRange(lightness, 0, 100) / 100
        const chroma = (1 - Math.abs((2 * l) - 1)) * s
        const huePrime = h / 60
        const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1))

        let red = 0
        let green = 0
        let blue = 0

        if (huePrime >= 0 && huePrime < 1) {
            red = chroma
            green = secondary
        } else if (huePrime < 2) {
            red = secondary
            green = chroma
        } else if (huePrime < 3) {
            green = chroma
            blue = secondary
        } else if (huePrime < 4) {
            green = secondary
            blue = chroma
        } else if (huePrime < 5) {
            red = secondary
            blue = chroma
        } else {
            red = chroma
            blue = secondary
        }

        const match = l - (chroma / 2)
        const toHexPair = function(channel) {
            const scaled = Math.round((channel + match) * 255)
            return clampRange(scaled, 0, 255).toString(16).padStart(2, '0')
        }

        return '#' + toHexPair(red) + toHexPair(green) + toHexPair(blue)
    }

    function hexToHsl(hexValue) {
        const hex = String(hexValue || '').trim().replace('#', '')
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null

        const red = parseInt(hex.slice(0, 2), 16) / 255
        const green = parseInt(hex.slice(2, 4), 16) / 255
        const blue = parseInt(hex.slice(4, 6), 16) / 255
        const max = Math.max(red, green, blue)
        const min = Math.min(red, green, blue)
        const delta = max - min
        const lightness = (max + min) / 2

        let hue = 0
        let saturation = 0

        if (delta > 0) {
            saturation = delta / (1 - Math.abs((2 * lightness) - 1))
            if (max === red) {
                hue = ((green - blue) / delta) % 6
            } else if (max === green) {
                hue = ((blue - red) / delta) + 2
            } else {
                hue = ((red - green) / delta) + 4
            }
            hue *= 60
        }

        return {
            hue: normalizeHue(hue),
            saturation: saturation * 100,
            lightness: lightness * 100
        }
    }

    function buildRandomTheme() {
        return {
            primary: hslToHex(randomBetween(0, 360), randomBetween(0, 100), randomBetween(50, 100)),
            secondary: hslToHex(randomBetween(0, 360), randomBetween(0, 100), randomBetween(0, 100)),
            accent: hslToHex(randomBetween(0, 360), randomBetween(0, 100), randomBetween(0, 100)),
            highlight: hslToHex(randomBetween(0, 360), randomBetween(0, 100), randomBetween(75, 100)),
            background: hslToHex(randomBetween(0, 360), randomBetween(0, 100), randomBetween(0, 16))
        }
    }

    function readThemeFromInputs(colorInputs) {
        return {
            primary: colorInputs[0] ? colorInputs[0].value : DEFAULT_THEME.primary,
            secondary: colorInputs[1] ? colorInputs[1].value : DEFAULT_THEME.secondary,
            accent: colorInputs[2] ? colorInputs[2].value : DEFAULT_THEME.accent,
            highlight: colorInputs[3] ? colorInputs[3].value : DEFAULT_THEME.highlight,
            background: colorInputs[4] ? colorInputs[4].value : DEFAULT_THEME.background
        }
    }

    function applyThemeToInputs(theme, colorInputs) {
        if (!Array.isArray(colorInputs)) return
        const values = [theme.primary, theme.secondary, theme.accent, theme.highlight, theme.background]
        colorInputs.forEach(function(input, index) {
            if (!input) return
            input.value = values[index] || input.value
        })
    }

    function averageRange(dataArray, startRatio, endRatio) {
        if (!dataArray || !dataArray.length) return 0
        const start = Math.floor(dataArray.length * clampRange(startRatio, 0, 1))
        const end = Math.max(start + 1, Math.floor(dataArray.length * clampRange(endRatio, 0, 1)))
        let total = 0
        let count = 0

        for (let index = start; index < end && index < dataArray.length; index += 1) {
            total += dataArray[index] / 255
            count += 1
        }

        return count ? total / count : 0
    }

    function averageAbsoluteStereoDifference(leftData, rightData) {
        if (!leftData || !rightData || leftData.length !== rightData.length || !leftData.length) return 0
        let total = 0
        let count = 0

        for (let index = 4; index < leftData.length; index += 1) {
            total += Math.abs(leftData[index] - rightData[index]) / 255
            count += 1
        }

        return count ? total / count : 0
    }

    function buildSpectrumBuckets(dataArray, target) {
        if (!Array.isArray(target) || !target.length) return target
        if (!dataArray || !dataArray.length) {
            target.fill(0)
            return target
        }

        const bucketSize = dataArray.length / target.length
        for (let bucketIndex = 0; bucketIndex < target.length; bucketIndex += 1) {
            const start = Math.floor(bucketIndex * bucketSize)
            const end = Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize))
            let total = 0
            let count = 0

            for (let index = start; index < end && index < dataArray.length; index += 1) {
                total += dataArray[index] / 255
                count += 1
            }

            target[bucketIndex] = count ? total / count : 0
        }

        return target
    }

    function getResponseMultiplier(input) {
        const value = input ? Number(input.value) : 100
        const max = input ? Number(input.max) : RESPONSE_MAX
        const clampedMax = Number.isFinite(max) && max > 0 ? max : RESPONSE_MAX
        return clampRange(value, 0, clampedMax) / 100
    }

    function getResponseProfile(input) {
        const multiplier = getResponseMultiplier(input)
        const boost = Math.max(0, multiplier - 1)
        const cut = Math.max(0, 1 - multiplier)
        return {
            multiplier: multiplier,
            attack: clampRange(9 + (boost * 11) - (cut * 3), 4, 26),
            release: clampRange(4.5 + (boost * 7) - (cut * 1.6), 2, 18),
            transient: clampRange(1 + (boost * 0.48) - (cut * 0.12), 0.7, 2.6),
            headroom: clampRange(1 + (boost * 0.18), 1, 1.35)
        }
    }

    function shapeResponsiveEnergy(value, profile) {
        const safeValue = clampRange(value, 0, 1.15)
        const multiplier = profile && Number.isFinite(profile.multiplier) ? profile.multiplier : 1
        const headroom = profile && Number.isFinite(profile.headroom) ? profile.headroom : 1
        const curvedPower = multiplier > 1
            ? Math.max(0.62, 1 - ((multiplier - 1) * 0.08))
            : 1 + ((1 - multiplier) * 0.16)
        return clampRange(Math.pow(safeValue * (0.86 + (multiplier * 0.28)), curvedPower) * headroom, 0, 1.35)
    }

    function buildZeroAudioData(sharedSpectrum) {
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
            spectrum: sharedSpectrum
        }
    }

    window.createVisualizerController = function createVisualizerController(config) {
        if (!config) return null

        const analyser = config.analyser || null
        const leftAnalyser = config.leftAnalyser || null
        const rightAnalyser = config.rightAnalyser || null
        const canvas = config.canvas || null
        const vizType = config.vizType || null
        const colorInputs = Array.isArray(config.colorInputs) ? config.colorInputs : []
        const randomButton = config.randomButton || null
        const rainbowToggle = config.rainbowToggle || null
        const isAudioPlaying = typeof config.isAudioPlaying === 'function' ? config.isAudioPlaying : function() { return false }
        const isMusicTabVisible = typeof config.isMusicTabVisible === 'function' ? config.isMusicTabVisible : function() { return false }

        const frequencyBinCount = analyser ? analyser.frequencyBinCount : 0
        const dataArray = frequencyBinCount ? new Uint8Array(frequencyBinCount) : null
        const leftDataArray = leftAnalyser && leftAnalyser.frequencyBinCount === frequencyBinCount ? new Uint8Array(frequencyBinCount) : null
        const rightDataArray = rightAnalyser && rightAnalyser.frequencyBinCount === frequencyBinCount ? new Uint8Array(frequencyBinCount) : null
        const sharedSpectrum = new Array(SPECTRUM_BUCKET_COUNT).fill(0)
        const liveAudioData = buildZeroAudioData(sharedSpectrum)

        const controllerState = {
            feedFrameId: 0,
            lastTimestamp: 0,
            rainbowFrameId: 0,
            rainbowTimestamp: 0,
            rainbowElapsedSeconds: 0,
            rainbowSeedHsl: [],
            isThreeSceneStarted: false,
            envelopes: {
                level: 0,
                bass: 0,
                mids: 0,
                highs: 0,
                kick: 0,
                snare: 0,
                hat: 0,
                presence: 0
            },
            impacts: {
                level: 0,
                bass: 0,
                mids: 0,
                highs: 0,
                kick: 0,
                snare: 0,
                hat: 0
            },
            stereoWidth: 0,
            stereoPan: 0,
            stereoMotion: 0,
            beatPulse: 0,
            downbeatPulse: 0,
            beatConfidence: 0,
            barPhase: 0,
            previousRaw: {
                level: 0,
                bass: 0,
                mids: 0,
                highs: 0,
                kick: 0,
                snare: 0,
                hat: 0,
                pan: 0
            }
        }

        function getCurrentTheme() {
            return readThemeFromInputs(colorInputs)
        }

        function stopRainbowCycle() {
            if (controllerState.rainbowFrameId) {
                cancelAnimationFrame(controllerState.rainbowFrameId)
                controllerState.rainbowFrameId = 0
            }
            controllerState.rainbowTimestamp = 0
            controllerState.rainbowElapsedSeconds = 0
        }

        function pushSettings() {
            if (!window.threeVisualizer) return

            const selectedMode = vizType ? String(vizType.value || 'v1') : 'v1'
            const visualizerMode = selectedMode === 'v2' ? 'v1' : selectedMode

            if (typeof window.threeVisualizer.setTheme === 'function') {
                window.threeVisualizer.setTheme(getCurrentTheme())
            }
            if (typeof window.threeVisualizer.setMode === 'function') {
                window.threeVisualizer.setMode(visualizerMode)
            }
        }

        function startRainbowCycle() {
            if (!rainbowToggle || !rainbowToggle.checked) return
            if (controllerState.rainbowFrameId) return

            controllerState.rainbowSeedHsl = colorInputs.map(function(input, index) {
                const fallback = index === 4
                    ? { hue: 220, saturation: 42, lightness: 7 }
                    : { hue: 210 + (index * 24), saturation: 84, lightness: 64 + (index * 4) }
                return hexToHsl(input ? input.value : '') || fallback
            })

            const step = function(timestamp) {
                if (!rainbowToggle || !rainbowToggle.checked) {
                    stopRainbowCycle()
                    return
                }

                const deltaSeconds = controllerState.rainbowTimestamp
                    ? Math.min(0.05, (timestamp - controllerState.rainbowTimestamp) / 1000)
                    : (1 / 60)
                const cycleElapsedSeconds = controllerState.rainbowElapsedSeconds
                controllerState.rainbowTimestamp = timestamp

                controllerState.rainbowSeedHsl.forEach(function(seed, index) {
                    const input = colorInputs[index]
                    if (!input) return

                    const hue = seed.hue + (cycleElapsedSeconds * RAINBOW_DEGREES_PER_SECOND * (1 + (index * 0.08)))
                    const saturation = index === 4
                        ? clampRange(seed.saturation, 0, 100)
                        : clampRange(seed.saturation + ((Math.sin(cycleElapsedSeconds + index) - Math.sin(index)) * 6), 0, 100)
                    const lightness = index === 4
                        ? clampRange(seed.lightness, 0, 100)
                        : clampRange(seed.lightness + ((Math.cos((cycleElapsedSeconds * 0.8) + index) - Math.cos(index)) * 4), 0, 100)

                    input.value = hslToHex(hue, saturation, lightness)
                })

                pushSettings()
                controllerState.rainbowElapsedSeconds += deltaSeconds
                controllerState.rainbowFrameId = requestAnimationFrame(step)
            }

            controllerState.rainbowFrameId = requestAnimationFrame(step)
        }

        function pushZeroAudio() {
            if (!window.threeVisualizer) return
            buildSpectrumBuckets(null, sharedSpectrum)
            if (typeof window.threeVisualizer.setAudioData === 'function') {
                window.threeVisualizer.setAudioData(buildZeroAudioData(sharedSpectrum))
            } else if (typeof window.threeVisualizer.setAudioLevel === 'function') {
                window.threeVisualizer.setAudioLevel(0)
            }
        }

        function updateAudioFrame(timestamp) {
            if (!analyser || !dataArray) {
                pushZeroAudio()
                return
            }

            const deltaSeconds = controllerState.lastTimestamp
                ? Math.min(0.05, Math.max(0.001, (timestamp - controllerState.lastTimestamp) / 1000))
                : (1 / 60)
            controllerState.lastTimestamp = timestamp

            analyser.getByteFrequencyData(dataArray)
            if (leftAnalyser && leftDataArray) leftAnalyser.getByteFrequencyData(leftDataArray)
            if (rightAnalyser && rightDataArray) rightAnalyser.getByteFrequencyData(rightDataArray)

            buildSpectrumBuckets(dataArray, sharedSpectrum)

            const rawLevel = averageRange(dataArray, 0.02, 1)
            const rawBass = averageRange(dataArray, 0.02, 0.15)
            const rawMids = averageRange(dataArray, 0.15, 0.52)
            const rawHighs = averageRange(dataArray, 0.52, 1)
            const rawPresence = averageRange(dataArray, 0.46, 0.76)
            const rawKick = averageRange(dataArray, 0.02, 0.07)
            const rawSnare = averageRange(dataArray, 0.18, 0.36)
            const rawHat = averageRange(dataArray, 0.68, 1)

            const levelProfile = getResponseProfile()
            const bassProfile = getResponseProfile()
            const midsProfile = getResponseProfile()
            const highsProfile = getResponseProfile()

            controllerState.envelopes.level = followValue(controllerState.envelopes.level, shapeResponsiveEnergy(rawLevel, levelProfile), deltaSeconds, levelProfile.attack, levelProfile.release)
            controllerState.envelopes.bass = followValue(controllerState.envelopes.bass, shapeResponsiveEnergy(rawBass, bassProfile), deltaSeconds, bassProfile.attack, bassProfile.release)
            controllerState.envelopes.mids = followValue(controllerState.envelopes.mids, shapeResponsiveEnergy(rawMids, midsProfile), deltaSeconds, midsProfile.attack, midsProfile.release)
            controllerState.envelopes.highs = followValue(controllerState.envelopes.highs, shapeResponsiveEnergy(rawHighs, highsProfile), deltaSeconds, highsProfile.attack, highsProfile.release)
            controllerState.envelopes.kick = followValue(controllerState.envelopes.kick, shapeResponsiveEnergy(rawKick, bassProfile), deltaSeconds, bassProfile.attack + 4, bassProfile.release)
            controllerState.envelopes.snare = followValue(controllerState.envelopes.snare, shapeResponsiveEnergy(rawSnare, midsProfile), deltaSeconds, midsProfile.attack + 4, midsProfile.release)
            controllerState.envelopes.hat = followValue(controllerState.envelopes.hat, shapeResponsiveEnergy(rawHat, highsProfile), deltaSeconds, highsProfile.attack + 5, highsProfile.release)
            controllerState.envelopes.presence = followValue(controllerState.envelopes.presence, shapeResponsiveEnergy(rawPresence, midsProfile), deltaSeconds, midsProfile.attack, midsProfile.release)

            const levelDelta = Math.max(0, rawLevel - controllerState.previousRaw.level)
            const bassDelta = Math.max(0, rawBass - controllerState.previousRaw.bass)
            const midsDelta = Math.max(0, rawMids - controllerState.previousRaw.mids)
            const highsDelta = Math.max(0, rawHighs - controllerState.previousRaw.highs)
            const kickDelta = Math.max(0, rawKick - controllerState.previousRaw.kick)
            const snareDelta = Math.max(0, rawSnare - controllerState.previousRaw.snare)
            const hatDelta = Math.max(0, rawHat - controllerState.previousRaw.hat)

            controllerState.impacts.level = followValue(controllerState.impacts.level, clampRange((levelDelta * (3.1 * levelProfile.transient)) + (rawLevel * 0.14), 0, 2.2), deltaSeconds, 18 * levelProfile.transient, 11)
            controllerState.impacts.bass = followValue(controllerState.impacts.bass, clampRange((bassDelta * (3.4 * bassProfile.transient)) + (rawBass * 0.18), 0, 2.4), deltaSeconds, 20 * bassProfile.transient, 11)
            controllerState.impacts.mids = followValue(controllerState.impacts.mids, clampRange((midsDelta * (3.1 * midsProfile.transient)) + (rawMids * 0.14), 0, 2.2), deltaSeconds, 18 * midsProfile.transient, 11)
            controllerState.impacts.highs = followValue(controllerState.impacts.highs, clampRange((highsDelta * (3.3 * highsProfile.transient)) + (rawHighs * 0.12), 0, 2.3), deltaSeconds, 20 * highsProfile.transient, 12)
            controllerState.impacts.kick = followValue(controllerState.impacts.kick, clampRange((kickDelta * (3.6 * bassProfile.transient)) + (rawKick * 0.22), 0, 2.5), deltaSeconds, 22 * bassProfile.transient, 12)
            controllerState.impacts.snare = followValue(controllerState.impacts.snare, clampRange((snareDelta * (3.4 * midsProfile.transient)) + (rawSnare * 0.18), 0, 2.3), deltaSeconds, 20 * midsProfile.transient, 12)
            controllerState.impacts.hat = followValue(controllerState.impacts.hat, clampRange((hatDelta * (3.8 * highsProfile.transient)) + (rawHat * 0.14), 0, 2.4), deltaSeconds, 22 * highsProfile.transient, 14)

            const leftLevel = leftDataArray ? averageRange(leftDataArray, 0.05, 0.95) : rawLevel
            const rightLevel = rightDataArray ? averageRange(rightDataArray, 0.05, 0.95) : rawLevel
            const panTarget = clampSigned((rightLevel - leftLevel) / Math.max(0.001, leftLevel + rightLevel), 1)
            const widthTarget = clampRange(averageAbsoluteStereoDifference(leftDataArray, rightDataArray) * 2.2, 0, 1.3)
            const motionTarget = clampRange((Math.abs(panTarget - controllerState.previousRaw.pan) * 14) + (widthTarget * 0.12), 0, 1.5)

            controllerState.stereoPan = followValue(controllerState.stereoPan, panTarget, deltaSeconds, 8.5, 6)
            controllerState.stereoWidth = followValue(controllerState.stereoWidth, widthTarget, deltaSeconds, 9.5, 6.5)
            controllerState.stereoMotion = followValue(controllerState.stereoMotion, motionTarget, deltaSeconds, 11, 8)

            const beatTarget = Math.max(0, (controllerState.impacts.bass * 0.46) + (controllerState.impacts.level * 0.24) + (controllerState.impacts.kick * 0.18) - 0.18)
            const downbeatTarget = Math.max(0, (controllerState.impacts.kick * 0.62) + (controllerState.envelopes.bass * 0.22) - 0.24)
            const confidenceTarget = clampRange((rawBass * 0.54) + (rawKick * 0.36) + (beatTarget * 0.12), 0, 1)

            controllerState.beatPulse = followValue(controllerState.beatPulse, beatTarget * 1.5, deltaSeconds, 20, 7)
            controllerState.downbeatPulse = followValue(controllerState.downbeatPulse, downbeatTarget * 1.55, deltaSeconds, 22, 7)
            controllerState.beatConfidence = followValue(controllerState.beatConfidence, confidenceTarget, deltaSeconds, 8, 4)
            controllerState.barPhase = (controllerState.barPhase + (deltaSeconds * (0.24 + controllerState.beatConfidence * 0.42))) % 1

            controllerState.previousRaw.level = rawLevel
            controllerState.previousRaw.bass = rawBass
            controllerState.previousRaw.mids = rawMids
            controllerState.previousRaw.highs = rawHighs
            controllerState.previousRaw.kick = rawKick
            controllerState.previousRaw.snare = rawSnare
            controllerState.previousRaw.hat = rawHat
            controllerState.previousRaw.pan = controllerState.stereoPan

            const levelBoost = clampRange((levelProfile.multiplier - 1) / 4, 0, 1)
            const bassBoost = clampRange((bassProfile.multiplier - 1) / 4, 0, 1)
            const midsBoost = clampRange((midsProfile.multiplier - 1) / 4, 0, 1)
            const highsBoost = clampRange((highsProfile.multiplier - 1) / 4, 0, 1)
            const responseDrive = clampRange((levelBoost * 0.34) + (bassBoost * 0.28) + (midsBoost * 0.2) + (highsBoost * 0.18), 0, 1)
            const surfaceDrive = clampRange(1 + (responseDrive * 0.88) + (bassBoost * 0.22) + (levelBoost * 0.14), 1, 2.25)
            const cameraDrive = clampRange(1 + (responseDrive * 0.82) + (levelBoost * 0.2) + (midsBoost * 0.12), 1, 2.35)
            const intimacyDrive = clampRange(1 + (responseDrive * 0.52) + (midsBoost * 0.22) + (highsBoost * 0.16), 1, 2.15)

            liveAudioData.level = controllerState.envelopes.level
            liveAudioData.bass = controllerState.envelopes.bass
            liveAudioData.mids = controllerState.envelopes.mids
            liveAudioData.highs = controllerState.envelopes.highs
            liveAudioData.levelImpact = controllerState.impacts.level
            liveAudioData.bassImpact = controllerState.impacts.bass
            liveAudioData.midsImpact = controllerState.impacts.mids
            liveAudioData.highsImpact = controllerState.impacts.highs
            liveAudioData.kick = controllerState.envelopes.kick
            liveAudioData.snare = controllerState.envelopes.snare
            liveAudioData.hat = controllerState.envelopes.hat
            liveAudioData.kickImpact = controllerState.impacts.kick
            liveAudioData.snareImpact = controllerState.impacts.snare
            liveAudioData.hatImpact = controllerState.impacts.hat
            liveAudioData.presence = controllerState.envelopes.presence
            liveAudioData.stereoWidth = controllerState.stereoWidth
            liveAudioData.stereoPan = controllerState.stereoPan
            liveAudioData.stereoMotion = controllerState.stereoMotion
            liveAudioData.beatPulse = controllerState.beatPulse
            liveAudioData.downbeatPulse = controllerState.downbeatPulse
            liveAudioData.beatConfidence = controllerState.beatConfidence
            liveAudioData.barPhase = controllerState.barPhase
            liveAudioData.barDrift = controllerState.stereoPan * 0.25
            liveAudioData.responseDrive = responseDrive
            liveAudioData.surfaceDrive = surfaceDrive
            liveAudioData.cameraDrive = cameraDrive
            liveAudioData.intimacyDrive = intimacyDrive

            if (typeof window.threeVisualizer.setAudioData === 'function') {
                window.threeVisualizer.setAudioData(liveAudioData)
            } else if (typeof window.threeVisualizer.setAudioLevel === 'function') {
                window.threeVisualizer.setAudioLevel(liveAudioData.level)
            }
        }

        function tick(timestamp) {
            if (!isAudioPlaying()) {
                controllerState.feedFrameId = 0
                controllerState.lastTimestamp = 0
                pushZeroAudio()
                return
            }

            updateAudioFrame(timestamp)
            controllerState.feedFrameId = requestAnimationFrame(tick)
        }

        function startThreeAudioFeed() {
            if (controllerState.feedFrameId) return
            controllerState.feedFrameId = requestAnimationFrame(tick)
        }

        function stopThreeAudioFeed() {
            if (controllerState.feedFrameId) {
                cancelAnimationFrame(controllerState.feedFrameId)
                controllerState.feedFrameId = 0
            }
            controllerState.lastTimestamp = 0
        }

        function sync() {
            const shouldKeepSceneRunning = isMusicTabVisible()
            const shouldAnimate = shouldKeepSceneRunning && isAudioPlaying()

            pushSettings()

            if (shouldKeepSceneRunning) {
                if (!controllerState.isThreeSceneStarted && window.threeVisualizer && typeof window.threeVisualizer.start === 'function') {
                    window.threeVisualizer.start(canvas)
                    controllerState.isThreeSceneStarted = true
                }

                if (shouldAnimate) {
                    startThreeAudioFeed()
                } else {
                    stopThreeAudioFeed()
                    pushZeroAudio()
                }
                return
            }

            stopThreeAudioFeed()
            pushZeroAudio()

            if (controllerState.isThreeSceneStarted && window.threeVisualizer && typeof window.threeVisualizer.stop === 'function') {
                window.threeVisualizer.stop()
                controllerState.isThreeSceneStarted = false
            }
        }

        function reset() {
            stopThreeAudioFeed()
            controllerState.envelopes.level = 0
            controllerState.envelopes.bass = 0
            controllerState.envelopes.mids = 0
            controllerState.envelopes.highs = 0
            controllerState.envelopes.kick = 0
            controllerState.envelopes.snare = 0
            controllerState.envelopes.hat = 0
            controllerState.envelopes.presence = 0
            controllerState.impacts.level = 0
            controllerState.impacts.bass = 0
            controllerState.impacts.mids = 0
            controllerState.impacts.highs = 0
            controllerState.impacts.kick = 0
            controllerState.impacts.snare = 0
            controllerState.impacts.hat = 0
            controllerState.stereoWidth = 0
            controllerState.stereoPan = 0
            controllerState.stereoMotion = 0
            controllerState.beatPulse = 0
            controllerState.downbeatPulse = 0
            controllerState.beatConfidence = 0
            controllerState.barPhase = 0
            controllerState.previousRaw.level = 0
            controllerState.previousRaw.bass = 0
            controllerState.previousRaw.mids = 0
            controllerState.previousRaw.highs = 0
            controllerState.previousRaw.kick = 0
            controllerState.previousRaw.snare = 0
            controllerState.previousRaw.hat = 0
            controllerState.previousRaw.pan = 0

            pushZeroAudio()

            if (controllerState.isThreeSceneStarted && window.threeVisualizer && typeof window.threeVisualizer.stop === 'function') {
                window.threeVisualizer.stop()
                controllerState.isThreeSceneStarted = false
            }
        }

        applyThemeToInputs(DEFAULT_THEME, colorInputs)

        colorInputs.forEach(function(input) {
            if (!input) return
            const onManualThemeChange = function() {
                if (rainbowToggle && rainbowToggle.checked) {
                    rainbowToggle.checked = false
                    stopRainbowCycle()
                }
                pushSettings()
            }
            input.addEventListener('input', onManualThemeChange)
            input.addEventListener('change', onManualThemeChange)
        })

        if (randomButton) {
            randomButton.addEventListener('click', function(event) {
                event.preventDefault()
                if (rainbowToggle && rainbowToggle.checked) {
                    rainbowToggle.checked = false
                    stopRainbowCycle()
                }
                applyThemeToInputs(buildRandomTheme(), colorInputs)
                pushSettings()
            })
        }

        if (rainbowToggle) {
            rainbowToggle.addEventListener('change', function() {
                if (rainbowToggle.checked) {
                    startRainbowCycle()
                } else {
                    stopRainbowCycle()
                }
                pushSettings()
            })
        }

        ;[vizType].forEach(function(input) {
            if (!input) return
            input.addEventListener('input', pushSettings)
            input.addEventListener('change', pushSettings)
        })

        window.addEventListener('resize', function() {
            if (!window.threeVisualizer || typeof window.threeVisualizer.resize !== 'function') return
            window.threeVisualizer.resize()
        })

        pushSettings()

        return {
            pushSettings: pushSettings,
            sync: sync,
            reset: reset
        }
    }
})()