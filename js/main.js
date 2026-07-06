let highestZ = { value: 0 }

const APP_DATA_FALLBACK_MESSAGE = "data couldn't be found - working on it..."
const PERSISTENT_USER_TAG_KEY = 'chatUserTag'

window.DATA_FALLBACK_MESSAGE = window.DATA_FALLBACK_MESSAGE || APP_DATA_FALLBACK_MESSAGE

function getAppDataFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || APP_DATA_FALLBACK_MESSAGE
}

function isLocalDevelopmentHost() {
    return window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function isEnabledQueryFlag(value) {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'on'
}

function isLocalServerFeaturesEnabled() {
    const searchParams = new URLSearchParams(window.location.search)
    return isEnabledQueryFlag(searchParams.get('server')) || isEnabledQueryFlag(searchParams.get('chat'))
}

const PHONE_PORTRAIT_SHORT_SIDE_MAX = 430
const PHONE_PORTRAIT_LONG_SIDE_MAX = 950
let runtimeLayoutFlagsBound = false

function getViewportMetrics() {
    const visualViewport = window.visualViewport
    const width = visualViewport ? visualViewport.width : window.innerWidth
    const height = visualViewport ? visualViewport.height : window.innerHeight

    return {
        width: Number(width) || window.innerWidth,
        height: Number(height) || window.innerHeight
    }
}

function isPhonePortraitRuntime() {
    const viewport = getViewportMetrics()
    const shortestSide = Math.min(viewport.width, viewport.height)
    const longestSide = Math.max(viewport.width, viewport.height)
    const isPortrait = viewport.height >= viewport.width

    return isPortrait
        && window.matchMedia('(pointer: coarse)').matches
        && shortestSide <= PHONE_PORTRAIT_SHORT_SIDE_MAX
        && longestSide <= PHONE_PORTRAIT_LONG_SIDE_MAX
}

function applyRuntimeLayoutFlags() {
    const desktopRoot = document.getElementById('desktop-root')
    if (!desktopRoot) return

    const viewport = getViewportMetrics()
    const shortestSide = Math.round(Math.min(viewport.width, viewport.height))
    const longestSide = Math.round(Math.max(viewport.width, viewport.height))

    desktopRoot.classList.toggle('is-phone-portrait-runtime', isPhonePortraitRuntime())
    desktopRoot.style.setProperty('--viewport-short-side', shortestSide + 'px')
    desktopRoot.style.setProperty('--viewport-long-side', longestSide + 'px')
}

function initRuntimeLayoutFlags() {
    if (runtimeLayoutFlagsBound) return
    runtimeLayoutFlagsBound = true

    applyRuntimeLayoutFlags()
    window.addEventListener('resize', applyRuntimeLayoutFlags)
    window.addEventListener('orientationchange', applyRuntimeLayoutFlags)

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', applyRuntimeLayoutFlags)
        window.visualViewport.addEventListener('scroll', applyRuntimeLayoutFlags)
    }
}

function createPersistentUserTag() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID().slice(0, 6).toLowerCase()
    }

    return Math.random().toString(36).slice(2, 8).toLowerCase()
}

function getPersistentUserTag() {
    let storedTag = ''

    try {
        storedTag = String(localStorage.getItem(PERSISTENT_USER_TAG_KEY) || '').trim().toLowerCase()
    } catch {
        storedTag = ''
    }

    if (!/^[a-z0-9]{4,8}$/.test(storedTag)) {
        storedTag = createPersistentUserTag()

        try {
            localStorage.setItem(PERSISTENT_USER_TAG_KEY, storedTag)
        } catch {
            return storedTag
        }
    }

    return storedTag
}

const APP_CONFIG = {
    windowConfigs: {
        changelogTab: {
            label: 'Changelog',
            icon: 'images/start_logo.png'
        },
        todoTab: {
            label: 'To Do',
            icon: 'images/start_logo.png'
        },
        aboutTab: {
            label: 'About me',
            icon: 'images/projects_logo.png'
        },
        projectsTab: {
            label: 'My projects',
            icon: 'images/projects_logo.png'
        },
        musicTab: {
            label: 'Music',
            icon: 'images/projects_logo.png'
        },
        chatTab: {
            label: 'Chatbox',
            icon: 'images/projects_logo.png'
        },
        visitorsTab: {
            label: 'Visitors',
            icon: 'images/projects_logo.png'
        },
        contactTab: {
            label: 'Contact me',
            icon: 'images/projects_logo.png'
        },
        picturesTab: {
            label: 'Photography',
            icon: 'images/projects_logo.png'
        },
        blogTab: {
            label: 'Blog',
            icon: 'images/projects_logo.png'
        },
        entityTab: {
            label: 'Entity',
            icon: 'images/projects_logo.png'
        },
        replyTab: {
            label: 'Reply chat',
            icon: 'images/projects_logo.png'
        }
    },
    desktopIconMap: {
        'About me': 'aboutTab',
        'Projects': 'projectsTab',
        'Contact': 'contactTab',
        'Music': 'musicTab',
        'Chatbox': 'chatTab',
        'Visitors': 'visitorsTab',
        'Photography': 'picturesTab',
        'Blog': 'blogTab'
    },
    windowControls: [
        { tabId: 'changelogTab', exitBtnId: 'exitbtnChangelog' },
        { tabId: 'todoTab', exitBtnId: 'exitbtnTodo' },
        { tabId: 'aboutTab', exitBtnId: 'exitbtnAbout', minBtnId: 'minbtnAbout' },
        { tabId: 'projectsTab', exitBtnId: 'exitbtnProjects', minBtnId: 'minbtnProjects' },
        { tabId: 'contactTab', exitBtnId: 'exitbtnContact', minBtnId: 'minbtnContact' },
        { tabId: 'musicTab', exitBtnId: 'exitbtnMusic', minBtnId: 'minbtnMusic' },
        { tabId: 'chatTab', exitBtnId: 'exitbtnChat', minBtnId: 'minbtnChat' },
        { tabId: 'visitorsTab', exitBtnId: 'exitbtnVisitors', minBtnId: 'minbtnVisitors' },
        { tabId: 'picturesTab', exitBtnId: 'exitbtnPictures', minBtnId: 'minbtnPictures' },
        { tabId: 'blogTab', exitBtnId: 'exitbtnBlog', minBtnId: 'minbtnBlog' },
        { tabId: 'replyTab', minBtnId: 'minbtnReply' }
    ],
    storageKeys: {
        globalVolume: 'globalVolume',
        chatMessages: 'chatMessages'
    },
    chat: {
        enabled: isLocalDevelopmentHost() ? isLocalServerFeaturesEnabled() : true,
        apiBase: isLocalDevelopmentHost() ? 'http://127.0.0.1:8787/chat' : '/chat',
        wsUrl: isLocalDevelopmentHost() ? 'ws://127.0.0.1:8787/chat/ws' : '',
        historyLimit: 100,
        disabledMessage: isLocalDevelopmentHost()
            ? 'Chat is disabled in local dev'
            : 'Chat is unavailable right now'
    },
    visitors: {
        enabled: isLocalDevelopmentHost() ? isLocalServerFeaturesEnabled() : true,
        apiBase: isLocalDevelopmentHost() ? 'http://127.0.0.1:8787/chat' : '/chat',
        wsUrl: isLocalDevelopmentHost() ? 'ws://127.0.0.1:8787/chat/ws' : '',
        disabledMessage: isLocalDevelopmentHost()
            ? 'Visitor counter is disabled in local dev'
            : 'Visitor counter is unavailable right now'
    }
}

window.highestZ = highestZ
window.APP_CONFIG = APP_CONFIG
window.getPersistentUserTag = getPersistentUserTag
window.isPhonePortraitRuntime = isPhonePortraitRuntime

var messageSpamState = { lastSendTime: 0 }

window.canSendMessage = function() {
    return Date.now() - messageSpamState.lastSendTime >= 5000
}

window.markMessageSent = function() {
    messageSpamState.lastSendTime = Date.now()
}

window.msUntilCanSend = function() {
    return Math.max(0, 5000 - (Date.now() - messageSpamState.lastSendTime))
}

function toRoman(value) {
    const romanMap = [
        ['M', 1000],
        ['CM', 900],
        ['D', 500],
        ['CD', 400],
        ['C', 100],
        ['XC', 90],
        ['L', 50],
        ['XL', 40],
        ['X', 10],
        ['IX', 9],
        ['V', 5],
        ['IV', 4],
        ['I', 1]
    ]
    let number = Math.max(1, Math.floor(Number(value) || 1))
    let roman = ''
    romanMap.forEach(function(pair) {
        const symbol = pair[0]
        const amount = pair[1]
        while (number >= amount) {
            roman += symbol
            number -= amount
        }
    })
    return roman
}

window.toRoman = toRoman

function getUserTime() {
    let now = new Date()
    let date = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
    document.getElementById('time').innerHTML = date

    let delay = (60 - now.getSeconds()) * 1000
    setTimeout(getUserTime, delay)
}

function formatChangelogDate(value) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value || '')

    return parsed.toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

function renderChangelogEntries(entries) {
    const changelogRoot = document.getElementById('changelogContent')
    if (!changelogRoot) return

    changelogRoot.innerHTML = ''

    const safeEntries = Array.isArray(entries) ? entries : []
    if (!safeEntries.length) {
        const emptyState = document.createElement('p')
        emptyState.className = 'changelog-empty'
        emptyState.textContent = getAppDataFallbackMessage()
        changelogRoot.appendChild(emptyState)
        return
    }

    safeEntries.forEach(function(entry) {
        const card = document.createElement('article')
        card.className = 'changelog-card changelog-card--' + String(entry.tag || 'note').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')

        const header = document.createElement('div')
        header.className = 'changelog-card-header'

        const version = document.createElement('h2')
        version.className = 'changelog-version'
        version.textContent = entry.version || 'Unreleased'

        const meta = document.createElement('div')
        meta.className = 'changelog-meta'

        const date = document.createElement('span')
        date.className = 'changelog-date'
        date.textContent = formatChangelogDate(entry.date)

        const tag = document.createElement('span')
        tag.className = 'changelog-tag'
        tag.textContent = String(entry.tag || 'note').toUpperCase()

        meta.appendChild(date)
        meta.appendChild(tag)
        header.appendChild(version)
        header.appendChild(meta)

        const summary = document.createElement('p')
        summary.className = 'changelog-summary'
        summary.textContent = entry.summary || ''

        card.appendChild(header)
        card.appendChild(summary)

        const highlights = Array.isArray(entry.highlights) ? entry.highlights.filter(Boolean) : []
        if (highlights.length) {
            const list = document.createElement('ul')
            list.className = 'changelog-highlights'

            highlights.forEach(function(item) {
                const listItem = document.createElement('li')
                listItem.textContent = item
                list.appendChild(listItem)
            })

            card.appendChild(list)
        }

        changelogRoot.appendChild(card)
    })
}

async function initChangelogTab() {
    const changelogRoot = document.getElementById('changelogContent')
    if (!changelogRoot) return

    try {
        const response = await fetch('misc/changelog.json', { cache: 'no-store' })
        if (!response.ok) throw new Error('Could not load changelog')

        const data = await response.json()
        renderChangelogEntries(data && data.entries)
    } catch (error) {
        console.warn('Using fallback changelog:', error)
        renderChangelogEntries([
            {
                version: 'oopsie',
                date: new Date().toISOString(),
                tag: 'fallback',
                summary: getAppDataFallbackMessage(),
                highlights: []
            }
        ])
    }
}

function renderTodoEntry(entry) {
    const todoRoot = document.getElementById('todoContent')
    if (!todoRoot) return

    todoRoot.innerHTML = ''

    const safeEntry = entry && typeof entry === 'object' ? entry : null
    const notes = safeEntry && Array.isArray(safeEntry.notes) ? safeEntry.notes.filter(Boolean) : []

    if (!notes.length) {
        const emptyState = document.createElement('p')
        emptyState.className = 'todo-empty'
        emptyState.textContent = getAppDataFallbackMessage()
        todoRoot.appendChild(emptyState)
        return
    }

    const card = document.createElement('article')
    card.className = 'todo-card'

    const notesList = document.createElement('ul')
    notesList.className = 'todo-notes'

    notes.forEach(function(noteText) {
        const note = document.createElement('li')
        note.className = 'todo-note'
        note.textContent = String(noteText).replace(/^\s*[-*]\s*/, '')
        notesList.appendChild(note)
    })

    card.appendChild(notesList)

    todoRoot.appendChild(card)
}

async function initTodoTab() {
    const todoRoot = document.getElementById('todoContent')
    if (!todoRoot) return

    try {
        const response = await fetch('misc/todo.json', { cache: 'no-store' })
        if (!response.ok) throw new Error('Could not load to do')

        const data = await response.json()
        const entry = data && typeof data === 'object' && data.entry
            ? data.entry
            : data
        renderTodoEntry(entry)
    } catch (error) {
        console.warn('Using fallback to do:', error)
        renderTodoEntry({
            notes: [getAppDataFallbackMessage()]
        })
    }
}

function initApp() {
    initRuntimeLayoutFlags()
    const tabsTaskbar = TabsTaskbar()
    window.tabsTaskbar = tabsTaskbar
    getUserTime()
    initOptionsTab()
    openTab(tabsTaskbar)
    bindWindowControls(tabsTaskbar)
    changelogMessage(tabsTaskbar)
    todoMessage(tabsTaskbar)
    globalVolumeControl()
    initMovableTabs()
    initTaskbarScroll()
    if (typeof initAboutTab === 'function') {
        initAboutTab()
    }
    initProjectsTab()
    initPicturesTab()
    if (typeof initChatTab === 'function') {
        initChatTab()
    }
    if (typeof initContactTab === 'function') {
        initContactTab()
    }
    if (typeof initVisitorsTab === 'function') {
        initVisitorsTab()
    }
    if (typeof initReplyTab === 'function') {
        initReplyTab()
    }
    initBlogTab().catch(function(error) {
        console.error('Blog tab failed to initialize:', error)
    })
    initChangelogTab().catch(function(error) {
        console.error('Changelog failed to initialize:', error)
    })
    initTodoTab().catch(function(error) {
        console.error('To Do failed to initialize:', error)
    })

    if (typeof initEntityTab === 'function') {
        Promise.resolve(initEntityTab()).catch(function(error) {
            console.error('Entity tab failed to initialize:', error)
        })
    }

    initMusicPlayer().catch(function(error) {
        console.error('Music player failed to initialize:', error)
    })
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp)
} else {
    initApp()
}
