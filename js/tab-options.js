const DEFAULT_OPTIONS_NAME = ''
const CURSOR_IMAGE_INDEX_PATH = 'images/pointers/index.json'
const CURSOR_THEME_FALLBACK_IDS = ['p1', 'p2', 'p3']
const CURSOR_CANVAS_SIZE = 32
const DEFAULT_SITE_PALETTE = {
    color1: '#bbbfbe',
    color2: '#a9b9b8',
    color3: '#91b1b0',
    color4: '#61a1a0',
    color5: '#018180',
    color6: '#016565',
    color7: '#064c4c',
    color8: '#0a3333',
    color9: '#0d1c1c',
    color10: '#233131'
}
const DEFAULT_CURSOR_THEME_ID = 'p1'

function createCursorThemeFromId(themeId, index) {
    const safeThemeId = String(themeId || '').trim()
    return {
        id: safeThemeId,
        label: 'Mouse ' + String(index + 1),
        preview: 'images/pointers/' + safeThemeId + '/normal.png',
        normal: 'images/pointers/' + safeThemeId + '/normal.png',
        pointer: 'images/pointers/' + safeThemeId + '/pointed.png'
    }
}

function initOptionsTab() {
    const button = document.getElementById('optionsBtn')
    const panel = document.getElementById('optionsPanel')

    if (!button || !panel) return

    const nameInput = document.getElementById('optionsNameInput')
    const resetButton = document.getElementById('optionsResetBtn')
    const cursorMenu = document.getElementById('optionsCursorMenu')
    const colorInputs = Array.from(panel.querySelectorAll('input[type="color"][data-palette-key]'))
    let cursorThemes = CURSOR_THEME_FALLBACK_IDS.map(function(themeId, index) {
        return createCursorThemeFromId(themeId, index)
    })

    if (!panel.style.display) panel.style.display = 'none'

    function normalizeHex(value, fallback) {
        const safeFallback = String(fallback || '#000000').toLowerCase()
        const normalized = String(value || '').trim().toLowerCase()
        return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : safeFallback
    }

    function loadStoredPalette() {
        try {
            const rawValue = localStorage.getItem('sitePalette')
            const parsed = rawValue ? JSON.parse(rawValue) : null
            if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SITE_PALETTE }

            return Object.keys(DEFAULT_SITE_PALETTE).reduce(function(accumulator, key) {
                accumulator[key] = normalizeHex(parsed[key], DEFAULT_SITE_PALETTE[key])
                return accumulator
            }, {})
        } catch (error) {
            return { ...DEFAULT_SITE_PALETTE }
        }
    }

    function applyPalette(palette) {
        Object.keys(DEFAULT_SITE_PALETTE).forEach(function(key) {
            document.documentElement.style.setProperty('--' + key, normalizeHex(palette[key], DEFAULT_SITE_PALETTE[key]))
        })
    }

    function syncColorInputs(palette) {
        colorInputs.forEach(function(input) {
            const paletteKey = input.dataset.paletteKey
            input.value = normalizeHex(palette[paletteKey], DEFAULT_SITE_PALETTE[paletteKey])
        })
    }

    function persistPalette(palette) {
        localStorage.setItem('sitePalette', JSON.stringify(palette))
    }

    function loadStoredName() {
        return localStorage.getItem('profileName') || DEFAULT_OPTIONS_NAME
    }

    function getStoredProfileName() {
        return String(loadStoredName()).trim()
    }

    function getCursorTheme(themeId) {
        const defaultTheme = cursorThemes.find(function(theme) {
            return theme.id === DEFAULT_CURSOR_THEME_ID
        }) || cursorThemes[0] || createCursorThemeFromId(DEFAULT_CURSOR_THEME_ID, 0)

        return cursorThemes.find(function(theme) {
            return theme.id === themeId
        }) || defaultTheme
    }

    function buildCursorValue(path, fallback) {
        return path ? 'url("' + path + '") 0 0, ' + fallback : fallback
    }

    function loadCursorAsset(path) {
        if (!path) return Promise.resolve('')

        return new Promise(function(resolve) {
            const image = new Image()
            image.onload = function() {
                if (image.width <= CURSOR_CANVAS_SIZE && image.height <= CURSOR_CANVAS_SIZE) {
                    resolve(path)
                    return
                }

                const canvas = document.createElement('canvas')
                canvas.width = CURSOR_CANVAS_SIZE
                canvas.height = CURSOR_CANVAS_SIZE

                const context = canvas.getContext('2d')
                if (!context) {
                    resolve(path)
                    return
                }

                context.clearRect(0, 0, CURSOR_CANVAS_SIZE, CURSOR_CANVAS_SIZE)
                context.imageSmoothingEnabled = false

                const scale = Math.min(CURSOR_CANVAS_SIZE / image.width, CURSOR_CANVAS_SIZE / image.height)
                const drawWidth = Math.max(1, Math.round(image.width * scale))
                const drawHeight = Math.max(1, Math.round(image.height * scale))
                context.drawImage(image, 0, 0, drawWidth, drawHeight)
                resolve(canvas.toDataURL('image/png'))
            }
            image.onerror = function() {
                resolve(path)
            }
            image.src = path
        })
    }

    function loadStoredCursorThemeId() {
        const storedThemeId = localStorage.getItem('cursorTheme')
        return cursorThemes.some(function(theme) {
            return theme.id === storedThemeId
        }) ? storedThemeId : DEFAULT_CURSOR_THEME_ID
    }

    function ensureCursorStyleElement() {
        let styleElement = document.getElementById('dynamicCursorThemeStyle')
        if (styleElement) return styleElement

        styleElement = document.createElement('style')
        styleElement.id = 'dynamicCursorThemeStyle'
        document.head.appendChild(styleElement)
        return styleElement
    }

    function applyCursorTheme(themeId) {
        const theme = getCursorTheme(themeId)

        return Promise.all([
            loadCursorAsset(theme.normal),
            loadCursorAsset(theme.pointer)
        ]).then(function(results) {
            const normalCursor = buildCursorValue(results[0], 'auto')
            const pointerCursor = buildCursorValue(results[1], 'pointer')
            const styleElement = ensureCursorStyleElement()

            document.documentElement.style.setProperty('--cursor-default', normalCursor)
            document.documentElement.style.setProperty('--cursor-pointer', pointerCursor)
            styleElement.textContent = [
                'html, body { cursor: ' + normalCursor + '; }',
                'button,',
                'a[href],',
                'label,',
                'summary,',
                '[role="button"],',
                '.dsk-icon,',
                'input[type="color"],',
                'input[type="range"],',
                'input[type="checkbox"],',
                'input[type="radio"],',
                'select,',
                '.blog-post-btn,',
                '.project-card,',
                '.pictures-grid-item,',
                '.pictures-info { cursor: ' + pointerCursor + ' !important; }'
            ].join('\n')

            return theme
        })
    }

    function updateCursorThemeSelection(activeThemeId) {
        if (!cursorMenu) return

        Array.from(cursorMenu.querySelectorAll('.options-cursor-option')).forEach(function(option) {
            const isActive = option.dataset.cursorThemeId === activeThemeId
            option.classList.toggle('is-active', isActive)
            option.setAttribute('aria-pressed', String(isActive))
        })
    }

    function renderCursorThemeMenu(activeThemeId) {
        if (!cursorMenu) return

        cursorMenu.innerHTML = ''

        cursorThemes.forEach(function(theme) {
            const option = document.createElement('button')
            option.type = 'button'
            option.className = 'options-cursor-option'
            option.dataset.cursorThemeId = theme.id
            option.setAttribute('aria-pressed', String(theme.id === activeThemeId))

            const label = document.createElement('span')
            label.textContent = theme.label

            const preview = document.createElement('img')
            preview.src = theme.preview || theme.pointer
            preview.alt = theme.label
            option.appendChild(preview)

            option.appendChild(label)
            option.addEventListener('click', function() {
                applyCursorTheme(theme.id).then(function(activeTheme) {
                    localStorage.setItem('cursorTheme', activeTheme.id)
                    updateCursorThemeSelection(activeTheme.id)
                })
            })

            cursorMenu.appendChild(option)
        })

        updateCursorThemeSelection(activeThemeId)
    }

    function setCursorThemesFromIds(themeIds) {
        const safeThemeIds = Array.isArray(themeIds)
            ? themeIds.filter(function(themeId) {
                return /^[a-z0-9_-]+$/i.test(String(themeId || '').trim())
            })
            : []

        const sourceThemeIds = safeThemeIds.length ? safeThemeIds : CURSOR_THEME_FALLBACK_IDS

        cursorThemes = sourceThemeIds.map(function(themeId, index) {
            return createCursorThemeFromId(themeId, index)
        })
    }

    async function loadCursorThemes() {
        const cachedCursorThemeIds = typeof window.getAppBootData === 'function' ? window.getAppBootData('cursorThemeIds') : undefined
        if (Array.isArray(cachedCursorThemeIds) && cachedCursorThemeIds.length) {
            setCursorThemesFromIds(cachedCursorThemeIds)

            const activeThemeId = loadStoredCursorThemeId()
            renderCursorThemeMenu(activeThemeId)
            applyCursorTheme(activeThemeId).then(function(activeTheme) {
                updateCursorThemeSelection(activeTheme.id)
            })
            return
        }

        try {
            const response = await fetch(CURSOR_IMAGE_INDEX_PATH, { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load cursor image index')

            const themeIds = await response.json()
            setCursorThemesFromIds(themeIds)
        } catch (error) {
            console.warn('Using fallback cursor image list:', error)
            setCursorThemesFromIds(CURSOR_THEME_FALLBACK_IDS)
        }

        const activeThemeId = loadStoredCursorThemeId()
        renderCursorThemeMenu(activeThemeId)
        applyCursorTheme(activeThemeId).then(function(activeTheme) {
            updateCursorThemeSelection(activeTheme.id)
        })
    }

    function isRotatedPortraitDesktop() {
        return window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches
    }

    function getDesktopLocalBounds() {
        const desktopRoot = document.getElementById('desktop-root')
        if (!desktopRoot) {
            return {
                width: window.innerWidth || document.documentElement.clientWidth || 0,
                height: window.innerHeight || document.documentElement.clientHeight || 0
            }
        }

        return {
            width: desktopRoot.clientWidth || 0,
            height: desktopRoot.clientHeight || 0
        }
    }

    function getDesktopLocalPointFromViewport(x, y) {
        const desktopRoot = document.getElementById('desktop-root')
        if (!desktopRoot) return { x, y }

        const rect = desktopRoot.getBoundingClientRect()
        if (!isRotatedPortraitDesktop()) {
            return { x: x - rect.left, y: y - rect.top }
        }

        const bounds = getDesktopLocalBounds()
        return {
            x: y - rect.top,
            y: bounds.height - (x - rect.left)
        }
    }

    function positionPanel() {
        const rect = button.getBoundingClientRect()
        const buttonLocalWidth = button.offsetWidth || rect.width
        const buttonLocalHeight = button.offsetHeight || rect.height
        const computed = getComputedStyle(panel)
        const wasHidden = computed.display === 'none' || panel.offsetHeight === 0
        const prevDisplay = panel.style.display
        const prevVisibility = panel.style.visibility

        if (wasHidden) {
            panel.style.visibility = 'hidden'
            panel.style.display = 'flex'
        }

        const panelHeight = panel.offsetHeight
        const panelWidth = panel.offsetWidth
        const anchorPoint = isRotatedPortraitDesktop()
            ? getDesktopLocalPointFromViewport(rect.right, rect.top)
            : getDesktopLocalPointFromViewport(rect.left, rect.top)
    const desktopBounds = getDesktopLocalBounds()
    const desktopWidth = desktopBounds.width
    const desktopHeight = desktopBounds.height

        let top = anchorPoint.y - panelHeight
    if (top < 0) top = anchorPoint.y + buttonLocalHeight

        let left = anchorPoint.x
        if (left + panelWidth > desktopWidth) left = Math.max(0, desktopWidth - panelWidth)
        if (left < 0) left = 0

        if (top + panelHeight > desktopHeight) top = Math.max(0, desktopHeight - panelHeight)

        panel.style.top = top + 'px'
        panel.style.left = left + 'px'

        if (wasHidden) {
            panel.style.display = prevDisplay || 'none'
            panel.style.visibility = prevVisibility || ''
        }
    }

    function openOptionsPanel(focusNameInput) {
        positionPanel()
        panel.style.display = 'flex'

        if (focusNameInput && nameInput) {
            nameInput.focus()
            nameInput.select()
        }
    }

    function closeOptionsPanel() {
        panel.style.display = 'none'
    }

    const initialPalette = loadStoredPalette()
    applyPalette(initialPalette)
    syncColorInputs(initialPalette)
    applyCursorTheme(loadStoredCursorThemeId())
    loadCursorThemes()

    window.getStoredProfileName = getStoredProfileName
    window.openOptionsPanel = function() {
        openOptionsPanel(true)
    }
    window.closeOptionsPanel = closeOptionsPanel

    if (nameInput) {
        nameInput.value = loadStoredName()
        nameInput.addEventListener('input', function() {
            localStorage.setItem('profileName', nameInput.value)
            window.dispatchEvent(new CustomEvent('profile-name-updated', {
                detail: {
                    name: String(nameInput.value || '')
                }
            }))
        })
    }

    colorInputs.forEach(function(input) {
        input.addEventListener('input', function() {
            const palette = loadStoredPalette()
            palette[input.dataset.paletteKey] = normalizeHex(input.value, DEFAULT_SITE_PALETTE[input.dataset.paletteKey])
            applyPalette(palette)
            persistPalette(palette)
        })
    })

    if (resetButton) {
        resetButton.addEventListener('click', function() {
            localStorage.removeItem('sitePalette')
            applyPalette(DEFAULT_SITE_PALETTE)
            syncColorInputs(DEFAULT_SITE_PALETTE)
        })
    }

    if (cursorMenu) {
        cursorMenu.addEventListener('wheel', function(event) {
            const scrollDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
            if (!scrollDelta) return

            event.preventDefault()
            cursorMenu.scrollLeft += scrollDelta
        }, { passive: false })
    }

    button.addEventListener('click', function() {
        if (panel.style.display === 'none') {
            openOptionsPanel(false)
        } else {
            closeOptionsPanel()
        }
    })

    document.addEventListener('mousedown', function(event) {
        if (panel.style.display === 'none') return
        if (panel.contains(event.target)) return
        if (button.contains(event.target)) return
        const customColorDialog = document.querySelector('.custom-color-dialog.is-open')
        if (customColorDialog && customColorDialog.contains(event.target)) return
        closeOptionsPanel()
    })

    window.addEventListener('resize', function() {
        if (panel.style.display !== 'none') positionPanel()
    })
}
