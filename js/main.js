let highestZ = { value: 0 }

const APP_DATA_FALLBACK_MESSAGE = "data couldn't be found - working on it..."

window.DATA_FALLBACK_MESSAGE = window.DATA_FALLBACK_MESSAGE || APP_DATA_FALLBACK_MESSAGE

function getAppDataFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || APP_DATA_FALLBACK_MESSAGE
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
        }
    },
    desktopIconMap: {
        'About me': 'aboutTab',
        'Projects': 'projectsTab',
        'Contact': 'contactTab',
        'Music': 'musicTab',
        'Chatbox': 'chatTab',
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
        { tabId: 'picturesTab', exitBtnId: 'exitbtnPictures', minBtnId: 'minbtnPictures' },
        { tabId: 'blogTab', exitBtnId: 'exitbtnBlog', minBtnId: 'minbtnBlog' }
    ],
    storageKeys: {
        globalVolume: 'globalVolume',
        chatMessages: 'chatMessages'
    }
}

window.highestZ = highestZ
window.APP_CONFIG = APP_CONFIG

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
