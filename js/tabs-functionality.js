function bindWindowControls(tabsTaskbar) {
    APP_CONFIG.windowControls.forEach(function(control) {
        const exitButton = document.getElementById(control.exitBtnId)
        if (exitButton) {
            exitButton.addEventListener('click', function() {
                tabsTaskbar.closeWindow(control.tabId)
            })
        }

        if (!control.minBtnId) return
        const minButton = document.getElementById(control.minBtnId)
        if (minButton) {
            minButton.addEventListener('click', function() {
                tabsTaskbar.minimizeWindow(control.tabId)
            })
        }
    })
}

function TabsTaskbar() {
    const taskbarTabs = document.getElementById('taskbarTabs')
    const windowConfigs = APP_CONFIG.windowConfigs

    function canOpenWindow(tabId) {
        const guards = window.windowOpenGuards || {}
        const guard = guards[tabId]
        return typeof guard === 'function' ? guard() !== false : true
    }

        // Store initial positions for each tab
        const initialPositions = {}
        Object.keys(windowConfigs).forEach(function(tabId) {
            const tab = document.getElementById(tabId)
            if (tab) {
                initialPositions[tabId] = {
                    top: tab.style.top,
                    left: tab.style.left,
                    right: tab.style.right,
                    bottom: tab.style.bottom
                }
            }
        })

    function getTab(tabId) {
        return document.getElementById(tabId)
    }

    function getTaskbarButton(tabId) {
        return taskbarTabs.querySelector('[data-tab-id="' + tabId + '"]')
    }

    function setActiveTaskbarButton(tabId) {
        const buttons = taskbarTabs.querySelectorAll('.taskbar-window-btn')
        buttons.forEach(function(button) {
            button.classList.toggle('is-active', button.dataset.tabId === tabId)
        })
    }

    function focusWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return
        if (!canOpenWindow(tabId)) return

        tab.style.display = tabId === 'aboutTab' ? 'flex' : 'block'
        tab.style.zIndex = ++highestZ.value
        if (tabId !== 'entityTab') {
            setActiveTaskbarButton(tabId)
        }
    }

    function createTaskbarButton(tabId) {
        if (tabId === 'entityTab') return
        if (getTaskbarButton(tabId) || !windowConfigs[tabId]) return

        const wrapper = document.createElement('div')
        wrapper.className = 'taskbar-tab'

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'taskbar-window-btn'
        button.dataset.tabId = tabId

        const icon = document.createElement('img')
        icon.src = windowConfigs[tabId].icon
        icon.alt = windowConfigs[tabId].label + ' icon'

        const label = document.createElement('span')
        label.textContent = windowConfigs[tabId].label

        button.appendChild(icon)
        button.appendChild(label)
        button.addEventListener('click', function() {
            toggleWindow(tabId)
        })

        wrapper.appendChild(button)
        taskbarTabs.appendChild(wrapper)
    }

    function removeTaskbarButton(tabId) {
        const button = getTaskbarButton(tabId)
        if (!button) return

        const wrapper = button.closest('.taskbar-tab')
        if (wrapper) wrapper.remove()
    }

    function getTopVisibleTabId(excludeTabId) {
        let topTabId = ''
        let topZ = -1

        Object.keys(windowConfigs).forEach(function(id) {
            if (id === excludeTabId) return
            if (id === 'entityTab') return

            const tab = getTab(id)
            if (!tab) return
            if (getComputedStyle(tab).display === 'none') return

            const z = Number(tab.style.zIndex || 0)
            if (z >= topZ) {
                topZ = z
                topTabId = id
            }
        })

        return topTabId
    }

    function toggleWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return
        if (!canOpenWindow(tabId)) return

        if (tabId === 'entityTab') {
            focusWindow(tabId)
            return
        }

        const button = getTaskbarButton(tabId)
        if (!button) return

        const isOpen = getComputedStyle(tab).display !== 'none'
        const isActive = button.classList.contains('is-active')

        // Clicking a background window's taskbar button should focus it,
        // while clicking the already-active one should minimize it.
        if (isOpen && isActive) {
            tab.style.display = 'none'
            setActiveTaskbarButton(getTopVisibleTabId(tabId))
        } else {
            focusWindow(tabId)
        }
    }

    function openWindow(tabId) {
        if (!canOpenWindow(tabId)) return

        // Reset tab to initial position if currently hidden
        const tab = getTab(tabId)
        if (tab && getComputedStyle(tab).display === 'none' && initialPositions[tabId]) {
            const pos = initialPositions[tabId]
            tab.style.top = pos.top
            tab.style.left = pos.left
            tab.style.right = pos.right
            tab.style.bottom = pos.bottom
        }
        createTaskbarButton(tabId)
        focusWindow(tabId)
    }

    function showTaskbarButton(tabId) {
        if (!canOpenWindow(tabId)) return
        createTaskbarButton(tabId)
    }

    function closeWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        if (tabId === 'entityTab') {
            focusWindow(tabId)
            return
        }

        // Reset position to initial state before closing
        if (initialPositions[tabId]) {
            const pos = initialPositions[tabId]
            tab.style.top = pos.top
            tab.style.left = pos.left
            tab.style.right = pos.right
            tab.style.bottom = pos.bottom
        }

        tab.style.display = 'none'
        removeTaskbarButton(tabId)
        setActiveTaskbarButton(getTopVisibleTabId(tabId))
        // Clean up event listeners if needed by descendants
        tab.classList.remove('no-select')
    }

    function minimizeWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        if (tabId === 'entityTab') {
            focusWindow(tabId)
            return
        }

        tab.style.display = 'none'
        setActiveTaskbarButton(getTopVisibleTabId(tabId))
    }

    Object.keys(windowConfigs).forEach(function(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        tab.addEventListener('mousedown', function() {
            if (getComputedStyle(tab).display === 'none') return
            focusWindow(tabId)
        })

        if (getComputedStyle(tab).display !== 'none') {
            createTaskbarButton(tabId)
            if (tabId !== 'entityTab') {
                setActiveTaskbarButton(tabId)
            }
        }
    })

    return {
        openWindow: openWindow,
        closeWindow: closeWindow,
        focusWindow: focusWindow,
        minimizeWindow: minimizeWindow,
        showTaskbarButton: showTaskbarButton
    }
}

function openTab(tabsTaskbar) {
    const icons = document.querySelectorAll('.dsk-icon')
    let selectedIcon = null
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

    icons.forEach(icon => {
        icon.addEventListener('click', function(e) {
            const label = this.querySelector('span').textContent
            const tabId = APP_CONFIG.desktopIconMap[label]

            if (isTouchDevice && tabId) {
                tabsTaskbar.openWindow(tabId)
                if (selectedIcon) selectedIcon.classList.remove('selected')
                this.classList.add('selected')
                selectedIcon = this
                e.preventDefault()
                e.stopPropagation()
                return
            }

            if (selectedIcon) selectedIcon.classList.remove('selected')
            this.classList.add('selected')
            selectedIcon = this
            e.preventDefault()
            e.stopPropagation()
        })

        icon.addEventListener('dblclick', function(e) {
            const label = this.querySelector('span').textContent
            const tabId = APP_CONFIG.desktopIconMap[label]
            if (tabId) tabsTaskbar.openWindow(tabId)
            e.preventDefault()
        })
    })

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dsk-icon')) {
            if (selectedIcon) selectedIcon.classList.remove('selected')
            selectedIcon = null
        }
    })
}

function getDesktopPointFromEvent(event) {
    const desktopRoot = document.getElementById('desktop-root') || document.body
    if (!desktopRoot) {
        return { x: event.clientX, y: event.clientY }
    }

    const rect = desktopRoot.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const transform = window.getComputedStyle(desktopRoot).transform

    if (!transform || transform === 'none' || typeof DOMMatrixReadOnly === 'undefined') {
        return point
    }

    const matrix = new DOMMatrixReadOnly(transform)
    const localPoint = matrix.inverse().transformPoint(new DOMPoint(point.x, point.y))
    return { x: localPoint.x, y: localPoint.y }
}

function makeMovable(tab, zTracker, handleSelector = '.popup-title, .tab-title') {
    let isDragging = false
    let startX = 0, startY = 0
    let origX = 0, origY = 0
    let activePointerId = null

    function onPointerMove(e) {
        if (!isDragging || e.pointerId !== activePointerId) return
        const point = getDesktopPointFromEvent(e)
        const dx = point.x - startX
        const dy = point.y - startY
        tab.style.left = (origX + dx) + 'px'
        tab.style.top = (origY + dy) + 'px'
    }

    function onPointerUp(e) {
        if (!isDragging || e.pointerId !== activePointerId) return
        isDragging = false
        activePointerId = null
        tab.classList.remove('no-select')
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
    }

    const handle = tab.querySelector(handleSelector) || tab

    handle.addEventListener('pointerdown', function(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        if (tab.dataset.moveLocked === 'true') return
        e.preventDefault()
        const point = getDesktopPointFromEvent(e)
        isDragging = true
        activePointerId = e.pointerId
        tab.classList.add('no-select')
        startX = point.x
        startY = point.y
        origX = tab.offsetLeft
        origY = tab.offsetTop
        tab.style.zIndex = ++zTracker.value
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerUp)
    })
}

function initMovableTabs() {
    let movableTabs = document.querySelectorAll('.movable')
    movableTabs.forEach(function(tab) {
        makeMovable(tab, highestZ)
    })
}

function initTaskbarScroll() {
    const taskbarTabs = document.getElementById('taskbarTabs')
    if (!taskbarTabs) return

    taskbarTabs.addEventListener('wheel', function(e) {
        const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY)
        const hasOverflow = taskbarTabs.scrollWidth > taskbarTabs.clientWidth

        if (hasOverflow) {
            e.preventDefault()
            const scrollAmount = e.deltaY !== 0 ? e.deltaY : e.deltaX
            taskbarTabs.scrollLeft += scrollAmount
        }
    }, { passive: false })
}

function changelogMessage(tabsTaskbar) {
    const changelogBtn = document.getElementById('utilsChangeLog')
    changelogBtn.addEventListener('click', function() {
        tabsTaskbar.openWindow('changelogTab')
    })
}

function todoMessage(tabsTaskbar) {
    const todoBtn = document.getElementById('utilsToDo')
    if (!todoBtn) return

    todoBtn.addEventListener('click', function() {
        tabsTaskbar.openWindow('todoTab')
    })
}
