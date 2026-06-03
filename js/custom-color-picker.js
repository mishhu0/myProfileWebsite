(function() {
    const ENHANCED_CLASS = 'custom-color-input'
    const CONTROL_CLASS = 'custom-color-control'
    const TRIGGER_CLASS = 'custom-color-trigger'
    const OPEN_CLASS = 'is-open'
    const SYNC_INTERVAL = 150

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value))
    }

    function normalizeHex(value, fallback) {
        const normalized = String(value || '').trim()
        if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toLowerCase()
        return fallback
    }

    function hexToRgb(hexValue) {
        const hex = normalizeHex(hexValue, '#000000').slice(1)
        return {
            red: parseInt(hex.slice(0, 2), 16),
            green: parseInt(hex.slice(2, 4), 16),
            blue: parseInt(hex.slice(4, 6), 16)
        }
    }

    function rgbToHex(red, green, blue) {
        return '#' + [red, green, blue].map(function(channel) {
            return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
        }).join('')
    }

    function rgbToHsl(hexValue) {
        const rgb = hexToRgb(hexValue)
        const red = rgb.red / 255
        const green = rgb.green / 255
        const blue = rgb.blue / 255
        const max = Math.max(red, green, blue)
        const min = Math.min(red, green, blue)
        const delta = max - min
        const lightness = (max + min) / 2
        let hue = 0
        let saturation = 0

        if (delta !== 0) {
            saturation = delta / (1 - Math.abs(2 * lightness - 1))
            switch (max) {
                case red:
                    hue = ((green - blue) / delta) % 6
                    break
                case green:
                    hue = ((blue - red) / delta) + 2
                    break
                default:
                    hue = ((red - green) / delta) + 4
                    break
            }
            hue *= 60
            if (hue < 0) hue += 360
        }

        return {
            hue: Math.round(hue),
            saturation: Math.round(saturation * 100),
            lightness: Math.round(lightness * 100)
        }
    }

    function hslToHex(hue, saturation, lightness) {
        const safeHue = ((Number(hue) % 360) + 360) % 360
        const safeSaturation = clamp(Number(saturation), 0, 100) / 100
        const safeLightness = clamp(Number(lightness), 0, 100) / 100
        const chroma = (1 - Math.abs(2 * safeLightness - 1)) * safeSaturation
        const huePrime = safeHue / 60
        const x = chroma * (1 - Math.abs((huePrime % 2) - 1))

        let red = 0
        let green = 0
        let blue = 0

        if (huePrime < 1) {
            red = chroma
            green = x
        } else if (huePrime < 2) {
            red = x
            green = chroma
        } else if (huePrime < 3) {
            green = chroma
            blue = x
        } else if (huePrime < 4) {
            green = x
            blue = chroma
        } else if (huePrime < 5) {
            red = x
            blue = chroma
        } else {
            red = chroma
            blue = x
        }

        const match = safeLightness - chroma / 2
        return rgbToHex((red + match) * 255, (green + match) * 255, (blue + match) * 255)
    }

    function createDialog() {
        const dialog = document.createElement('div')
        dialog.className = 'custom-color-dialog'
        dialog.setAttribute('aria-hidden', 'true')

        dialog.innerHTML = [
            '<div class="custom-color-preview" id="customColorPreview"></div>',
            '<input class="custom-color-hex" id="customColorHex" type="text" maxlength="7" spellcheck="false" />',
            '<div class="custom-color-sliders">',
            '  <label class="custom-color-slider-row">',
            '    <span>H</span>',
            '    <input id="customColorHue" type="range" min="0" max="360" value="0" />',
            '    <span class="custom-color-value" id="customColorHueValue">0</span>',
            '  </label>',
            '  <label class="custom-color-slider-row">',
            '    <span>S</span>',
            '    <input id="customColorSaturation" type="range" min="0" max="100" value="100" />',
            '    <span class="custom-color-value" id="customColorSaturationValue">100</span>',
            '  </label>',
            '  <label class="custom-color-slider-row">',
            '    <span>L</span>',
            '    <input id="customColorLightness" type="range" min="0" max="100" value="50" />',
            '    <span class="custom-color-value" id="customColorLightnessValue">50</span>',
            '  </label>',
            '</div>',
            '<div class="custom-color-actions">',
            '  <button type="button" class="custom-color-btn" id="customColorClose">Close</button>',
            '</div>'
        ].join('')

        document.body.appendChild(dialog)
        return dialog
    }

    const dialog = createDialog()
    const preview = dialog.querySelector('#customColorPreview')
    const hexInput = dialog.querySelector('#customColorHex')
    const hueInput = dialog.querySelector('#customColorHue')
    const saturationInput = dialog.querySelector('#customColorSaturation')
    const lightnessInput = dialog.querySelector('#customColorLightness')
    const hueValue = dialog.querySelector('#customColorHueValue')
    const saturationValue = dialog.querySelector('#customColorSaturationValue')
    const lightnessValue = dialog.querySelector('#customColorLightnessValue')
    const closeButton = dialog.querySelector('#customColorClose')

    let activeInput = null
    let activeTrigger = null

    function dispatchColorUpdate(input, nextValue) {
        const normalized = normalizeHex(nextValue, input.value || '#000000')
        input.value = normalized
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    function updateTrigger(trigger, value) {
        const normalized = normalizeHex(value, '#000000')
        trigger.style.backgroundColor = normalized
        trigger.setAttribute('aria-label', 'Selected color ' + normalized)
        trigger.title = normalized
    }

    function syncDialogFromHex(value) {
        const normalized = normalizeHex(value, '#000000')
        const hsl = rgbToHsl(normalized)
        hexInput.value = normalized
        hueInput.value = String(hsl.hue)
        saturationInput.value = String(hsl.saturation)
        lightnessInput.value = String(hsl.lightness)
        hueValue.textContent = String(hsl.hue)
        saturationValue.textContent = String(hsl.saturation)
        lightnessValue.textContent = String(hsl.lightness)
        preview.style.backgroundColor = normalized
    }

    function syncActiveInput(nextValue) {
        if (!activeInput || !activeTrigger) return
        dispatchColorUpdate(activeInput, nextValue)
        updateTrigger(activeTrigger, activeInput.value)
        syncDialogFromHex(activeInput.value)
    }

    function closeDialog() {
        dialog.classList.remove(OPEN_CLASS)
        dialog.setAttribute('aria-hidden', 'true')
        activeInput = null
        activeTrigger = null
    }

    function positionDialog(trigger) {
        const rect = trigger.getBoundingClientRect()
        dialog.classList.add(OPEN_CLASS)
        dialog.setAttribute('aria-hidden', 'false')

        const width = dialog.offsetWidth
        const height = dialog.offsetHeight
        let left = rect.left
        let top = rect.bottom + 6

        if (left + width > window.innerWidth) left = Math.max(8, window.innerWidth - width - 8)
        if (top + height > window.innerHeight) top = Math.max(8, rect.top - height - 6)

        dialog.style.left = left + 'px'
        dialog.style.top = top + 'px'
    }

    function openDialog(input, trigger) {
        activeInput = input
        activeTrigger = trigger
        syncDialogFromHex(input.value || '#000000')
        positionDialog(trigger)
        hexInput.focus()
        hexInput.select()
    }

    function getAssociatedLabels(input) {
        if (!input || !input.id) return []

        return Array.from(document.querySelectorAll('label[for="' + input.id + '"]'))
    }

    function enhanceInput(input) {
        if (!(input instanceof HTMLInputElement)) return
        if (input.classList.contains(ENHANCED_CLASS)) return

        input.classList.add(ENHANCED_CLASS)
        const control = document.createElement('span')
        control.className = CONTROL_CLASS
        const associatedLabels = getAssociatedLabels(input)

        const trigger = document.createElement('button')
        trigger.type = 'button'
        trigger.className = TRIGGER_CLASS
        updateTrigger(trigger, input.value || '#000000')

        trigger.addEventListener('click', function(event) {
            event.preventDefault()
            if (activeInput === input && dialog.classList.contains(OPEN_CLASS)) {
                closeDialog()
                return
            }
            openDialog(input, trigger)
        })

        input.addEventListener('click', function(event) {
            event.preventDefault()
            event.stopPropagation()
        })

        input.addEventListener('mousedown', function(event) {
            event.preventDefault()
            event.stopPropagation()
        })

        associatedLabels.forEach(function(label) {
            label.removeAttribute('for')
            label.addEventListener('click', function(event) {
                if (event.target === trigger || trigger.contains(event.target)) return
                event.preventDefault()
                event.stopPropagation()
                openDialog(input, trigger)
            })
        })

        input.insertAdjacentElement('afterend', control)
        control.appendChild(trigger)
        input.addEventListener('input', function() {
            updateTrigger(trigger, input.value)
            if (activeInput === input) syncDialogFromHex(input.value)
        })
    }

    function enhanceAll() {
        document.querySelectorAll('input[type="color"]').forEach(enhanceInput)
    }

    hueInput.addEventListener('input', function() {
        hueValue.textContent = hueInput.value
        syncActiveInput(hslToHex(hueInput.value, saturationInput.value, lightnessInput.value))
    })

    saturationInput.addEventListener('input', function() {
        saturationValue.textContent = saturationInput.value
        syncActiveInput(hslToHex(hueInput.value, saturationInput.value, lightnessInput.value))
    })

    lightnessInput.addEventListener('input', function() {
        lightnessValue.textContent = lightnessInput.value
        syncActiveInput(hslToHex(hueInput.value, saturationInput.value, lightnessInput.value))
    })

    hexInput.addEventListener('input', function() {
        const normalized = normalizeHex(hexInput.value, '')
        if (!normalized) return
        syncActiveInput(normalized)
    })

    closeButton.addEventListener('click', closeDialog)

    document.addEventListener('mousedown', function(event) {
        if (!dialog.classList.contains(OPEN_CLASS)) return
        if (dialog.contains(event.target)) return
        if (activeTrigger && activeTrigger.contains(event.target)) return
        closeDialog()
    })

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') closeDialog()
    })

    window.addEventListener('resize', function() {
        if (activeTrigger && dialog.classList.contains(OPEN_CLASS)) positionDialog(activeTrigger)
    })

    enhanceAll()
    window.setInterval(function() {
        document.querySelectorAll('input[type="color"].' + ENHANCED_CLASS).forEach(function(input) {
            const trigger = input.nextElementSibling && input.nextElementSibling.classList.contains(CONTROL_CLASS)
                ? input.nextElementSibling.querySelector('.' + TRIGGER_CLASS)
                : null
            if (trigger) updateTrigger(trigger, input.value)
        })
    }, SYNC_INTERVAL)
})()