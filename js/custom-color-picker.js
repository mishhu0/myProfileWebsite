(function() {
    const ENHANCED_CLASS = 'custom-color-input'
    const CONTROL_CLASS = 'custom-color-control'
    const TRIGGER_CLASS = 'custom-color-trigger'
    const SELECT_ENHANCED_CLASS = 'custom-select-input'
    const SELECT_CONTROL_CLASS = 'custom-select-control'
    const SELECT_TRIGGER_CLASS = 'custom-select-trigger'
    const SELECT_TRIGGER_LABEL_CLASS = 'custom-select-trigger-label'
    const SELECT_TRIGGER_CARET_CLASS = 'custom-select-trigger-caret'
    const SELECT_MENU_CLASS = 'custom-select-menu'
    const SELECT_OPTION_CLASS = 'custom-select-option'
    const OPEN_CLASS = 'is-open'
    const SYNC_INTERVAL = 150

    function getOverlayHost() {
        return document.getElementById('desktop-root') || document.body
    }

    function isRotatedPortraitDesktop(host) {
        return host && host.id === 'desktop-root' && window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches
    }

    function getOverlayBounds(host) {
        const overlayHost = host || getOverlayHost()
        if (!overlayHost || overlayHost === document.body) {
            return {
                width: window.innerWidth || document.documentElement.clientWidth || 0,
                height: window.innerHeight || document.documentElement.clientHeight || 0
            }
        }

        return {
            width: overlayHost.clientWidth || window.innerWidth || 0,
            height: overlayHost.clientHeight || window.innerHeight || 0
        }
    }

    function toOverlayCoordinates(viewportRect, host) {
        const overlayHost = host || getOverlayHost()
        if (!overlayHost || overlayHost === document.body) {
            return {
                left: viewportRect.left,
                top: viewportRect.top,
                width: viewportRect.width,
                height: viewportRect.height,
                right: viewportRect.right,
                bottom: viewportRect.bottom
            }
        }

        const hostRect = overlayHost.getBoundingClientRect()
        if (!isRotatedPortraitDesktop(overlayHost)) {
            return {
                left: viewportRect.left - hostRect.left,
                top: viewportRect.top - hostRect.top,
                width: viewportRect.width,
                height: viewportRect.height,
                right: viewportRect.right - hostRect.left,
                bottom: viewportRect.bottom - hostRect.top
            }
        }

        const bounds = getOverlayBounds(overlayHost)
        const left = viewportRect.top - hostRect.top
        const top = bounds.height - (viewportRect.right - hostRect.left)
        const width = viewportRect.height
        const height = viewportRect.width

        return {
            left: left,
            top: top,
            width: width,
            height: height,
            right: left + width,
            bottom: top + height
        }
    }

    function positionOverlayNearTrigger(overlay, trigger, options) {
        if (!overlay || !trigger) return

        const config = options && typeof options === 'object' ? options : {}
        const gap = Number.isFinite(config.gap) ? config.gap : 6
        const margin = Number.isFinite(config.margin) ? config.margin : 8
        const overlayHost = getOverlayHost()
        const triggerRect = toOverlayCoordinates(trigger.getBoundingClientRect(), overlayHost)

        overlay.classList.add(OPEN_CLASS)
        overlay.setAttribute('aria-hidden', 'false')

        const overlayWidth = overlay.offsetWidth
        const overlayHeight = overlay.offsetHeight
        const bounds = getOverlayBounds(overlayHost)
        let left = triggerRect.left
        let top = triggerRect.bottom + gap

        if (left + overlayWidth > bounds.width - margin) {
            left = Math.max(margin, bounds.width - overlayWidth - margin)
        }

        if (top + overlayHeight > bounds.height - margin) {
            top = Math.max(margin, triggerRect.top - overlayHeight - gap)
        }

        if (left < margin) left = margin
        if (top < margin) top = margin

        overlay.style.left = left + 'px'
        overlay.style.top = top + 'px'
    }

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
            '    <span class="custom-color-slider-label">Hue</span>',
            '    <input id="customColorHue" type="range" min="0" max="360" value="0" />',
            '    <span class="custom-color-value" id="customColorHueValue">0</span>',
            '  </label>',
            '  <label class="custom-color-slider-row">',
            '    <span class="custom-color-slider-label">Sat</span>',
            '    <input id="customColorSaturation" type="range" min="0" max="100" value="100" />',
            '    <span class="custom-color-value" id="customColorSaturationValue">100%</span>',
            '  </label>',
            '  <label class="custom-color-slider-row">',
            '    <span class="custom-color-slider-label">Light</span>',
            '    <input id="customColorLightness" type="range" min="0" max="100" value="50" />',
            '    <span class="custom-color-value" id="customColorLightnessValue">50%</span>',
            '  </label>',
            '</div>',
            '<div class="custom-color-actions">',
            '  <button type="button" class="custom-color-btn" id="customColorClose">close</button>',
            '</div>'
        ].join('')

        getOverlayHost().appendChild(dialog)
        return dialog
    }

    function createSelectMenu() {
        const menu = document.createElement('div')
        menu.className = SELECT_MENU_CLASS
        menu.setAttribute('aria-hidden', 'true')
        getOverlayHost().appendChild(menu)
        return menu
    }

    const dialog = createDialog()
    const selectMenu = createSelectMenu()
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
    let activeSelect = null
    let activeSelectTrigger = null

    function dispatchColorUpdate(input, nextValue) {
        const normalized = normalizeHex(nextValue, input.value || '#000000')
        input.value = normalized
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    function updateTrigger(trigger, value) {
        const normalized = normalizeHex(value, '#000000')
        if (trigger.dataset.currentColor !== normalized) {
            trigger.style.backgroundColor = normalized
            trigger.setAttribute('aria-label', 'Selected color ' + normalized)
            trigger.title = normalized
            trigger.dataset.currentColor = normalized
        }
    }

    function formatSliderValue(kind, value) {
        const normalized = String(value || '0')
        if (kind === 'saturation' || kind === 'lightness') {
            return normalized + '%'
        }

        return normalized
    }

    function syncDialogFromHex(value) {
        const normalized = normalizeHex(value, '#000000')
        const hsl = rgbToHsl(normalized)
        hexInput.value = normalized
        hueInput.value = String(hsl.hue)
        saturationInput.value = String(hsl.saturation)
        lightnessInput.value = String(hsl.lightness)
        hueValue.textContent = formatSliderValue('hue', hsl.hue)
        saturationValue.textContent = formatSliderValue('saturation', hsl.saturation)
        lightnessValue.textContent = formatSliderValue('lightness', hsl.lightness)
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
        positionOverlayNearTrigger(dialog, trigger, { gap: 6, margin: 8 })
    }

    function openDialog(input, trigger) {
        closeSelectMenu()
        activeInput = input
        activeTrigger = trigger
        syncDialogFromHex(input.value || '#000000')
        positionDialog(trigger)
        hexInput.focus()
        hexInput.select()
    }

    function updateSelectTrigger(trigger, select) {
        if (!trigger || !select) return

        const labelNode = trigger.querySelector('.' + SELECT_TRIGGER_LABEL_CLASS)
        const selectedOption = select.options[select.selectedIndex] || select.options[0] || null
        const label = selectedOption ? String(selectedOption.textContent || '').trim() : ''
        const ariaLabel = label ? 'Selected option ' + label : 'Select option'

        if (labelNode && labelNode.textContent !== label) {
            labelNode.textContent = label
        }

        if (trigger.title !== label) {
            trigger.title = label
        }

        if (trigger.getAttribute('aria-label') !== ariaLabel) {
            trigger.setAttribute('aria-label', ariaLabel)
        }
    }

    function closeSelectMenu() {
        if (activeSelectTrigger) {
            activeSelectTrigger.setAttribute('aria-expanded', 'false')
        }

        selectMenu.classList.remove(OPEN_CLASS)
        selectMenu.setAttribute('aria-hidden', 'true')
        selectMenu.innerHTML = ''
        activeSelect = null
        activeSelectTrigger = null
    }

    function renderSelectMenu(select) {
        selectMenu.innerHTML = ''

        Array.from(select.options).forEach(function(option, index) {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = SELECT_OPTION_CLASS + (option.selected ? ' is-active' : '')
            button.textContent = String(option.textContent || '').trim()
            button.disabled = Boolean(option.disabled)
            button.setAttribute('aria-pressed', option.selected ? 'true' : 'false')

            button.addEventListener('click', function(event) {
                event.preventDefault()
                if (option.disabled) return

                select.selectedIndex = index
                select.value = option.value
                updateSelectTrigger(activeSelectTrigger, select)
                select.dispatchEvent(new Event('input', { bubbles: true }))
                select.dispatchEvent(new Event('change', { bubbles: true }))
                closeSelectMenu()
            })

            selectMenu.appendChild(button)
        })
    }

    function positionSelectMenu(trigger) {
        selectMenu.style.minWidth = Math.max(trigger.offsetWidth || 0, 56) + 'px'
        positionOverlayNearTrigger(selectMenu, trigger, { gap: 6, margin: 8 })
    }

    function openSelectMenu(select, trigger) {
        closeDialog()
        activeSelect = select
        activeSelectTrigger = trigger
        renderSelectMenu(select)
        trigger.setAttribute('aria-expanded', 'true')
        positionSelectMenu(trigger)
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

    function enhanceSelect(select) {
        if (!(select instanceof HTMLSelectElement)) return
        if (select.classList.contains(SELECT_ENHANCED_CLASS)) return

        select.classList.add(SELECT_ENHANCED_CLASS)

        const control = document.createElement('span')
        control.className = SELECT_CONTROL_CLASS

        const trigger = document.createElement('button')
        trigger.type = 'button'
        trigger.className = SELECT_TRIGGER_CLASS
        trigger.setAttribute('aria-expanded', 'false')

        const label = document.createElement('span')
        label.className = SELECT_TRIGGER_LABEL_CLASS

        const caret = document.createElement('span')
        caret.className = SELECT_TRIGGER_CARET_CLASS
        caret.setAttribute('aria-hidden', 'true')
        caret.textContent = '▼'

        trigger.appendChild(label)
        trigger.appendChild(caret)
        control.appendChild(trigger)

        trigger.addEventListener('click', function(event) {
            event.preventDefault()

            if (activeSelect === select && selectMenu.classList.contains(OPEN_CLASS)) {
                closeSelectMenu()
                return
            }

            openSelectMenu(select, trigger)
        })

        select.insertAdjacentElement('afterend', control)
        updateSelectTrigger(trigger, select)

        select.addEventListener('input', function() {
            updateSelectTrigger(trigger, select)
            if (activeSelect === select && activeSelectTrigger === trigger) {
                renderSelectMenu(select)
                positionSelectMenu(trigger)
            }
        })

        select.addEventListener('change', function() {
            updateSelectTrigger(trigger, select)
            if (activeSelect === select && activeSelectTrigger === trigger) {
                renderSelectMenu(select)
                positionSelectMenu(trigger)
            }
        })
    }

    function enhanceAll() {
        document.querySelectorAll('input[type="color"]').forEach(enhanceInput)
        document.querySelectorAll('select').forEach(enhanceSelect)
    }

    hueInput.addEventListener('input', function() {
        hueValue.textContent = formatSliderValue('hue', hueInput.value)
        syncActiveInput(hslToHex(hueInput.value, saturationInput.value, lightnessInput.value))
    })

    saturationInput.addEventListener('input', function() {
        saturationValue.textContent = formatSliderValue('saturation', saturationInput.value)
        syncActiveInput(hslToHex(hueInput.value, saturationInput.value, lightnessInput.value))
    })

    lightnessInput.addEventListener('input', function() {
        lightnessValue.textContent = formatSliderValue('lightness', lightnessInput.value)
        syncActiveInput(hslToHex(hueInput.value, saturationInput.value, lightnessInput.value))
    })

    hexInput.addEventListener('input', function() {
        const normalized = normalizeHex(hexInput.value, '')
        if (!normalized) return
        syncActiveInput(normalized)
    })

    closeButton.addEventListener('click', closeDialog)

    document.addEventListener('mousedown', function(event) {
        if (dialog.classList.contains(OPEN_CLASS)) {
            if (!dialog.contains(event.target) && !(activeTrigger && activeTrigger.contains(event.target))) {
                closeDialog()
            }
        }

        if (selectMenu.classList.contains(OPEN_CLASS)) {
            if (!selectMenu.contains(event.target) && !(activeSelectTrigger && activeSelectTrigger.contains(event.target))) {
                closeSelectMenu()
            }
        }
    })

    document.addEventListener('keydown', function(event) {
        if (event.key !== 'Escape') return
        closeDialog()
        closeSelectMenu()
    })

    window.addEventListener('resize', function() {
        if (activeTrigger && dialog.classList.contains(OPEN_CLASS)) positionDialog(activeTrigger)
        if (activeSelectTrigger && selectMenu.classList.contains(OPEN_CLASS)) positionSelectMenu(activeSelectTrigger)
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