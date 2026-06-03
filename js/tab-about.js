const ABOUT_INDEX_PATH = 'about/index.json'

function getAboutFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || "data couldn't be found - working on it..."
}

function getAboutFallbackData() {
    const message = getAboutFallbackMessage()

    return {
        index: {
            tabLabels: {
                about: 'About',
                interests: 'Interests',
                love: 'I love',
                dislike: 'I dislike',
                skills: 'Skills'
            },
            profileFile: 'about/profile.json',
            panelFiles: {
                about: 'about/about.json',
                interests: 'about/interests.json',
                love: 'about/love.json',
                dislike: 'about/dislike.json',
                skills: 'about/skills.json'
            }
        },
        profile: {
            sections: [
                {
                    variant: 'identity',
                    value: message
                },
                {
                    variant: 'inline',
                    label: 'living in',
                    value: message
                },
                {
                    variant: 'centered',
                    label: '.────˚⊱ feeling ⊰˚────.',
                    mood: {
                        leftMark: '.✦',
                        value: message,
                        rightMark: '✦.',
                        primary: '#666666',
                        secondary: '#999999',
                        accent: '#cccccc',
                        text: '#ffffff'
                    }
                },
                {
                    variant: 'song',
                    label: 'song of the moment',
                    value: message
                }
            ]
        },
        panels: {
            about: {
                paragraphs: [message]
            },
            interests: {
                paragraphs: [message]
            },
            love: {
                items: [message]
            },
            dislike: {
                items: [message]
            },
            skills: {
                groups: [
                    {
                        items: [
                            {
                                text: message
                            }
                        ]
                    }
                ]
            }
        }
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function getSafeCssColor(value) {
    const candidate = String(value || '').trim()
    if (!candidate) return ''
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return ''
    return CSS.supports('color', candidate) ? candidate : ''
}

function getFeelingPalette(feelingData) {
    const primary = getSafeCssColor(feelingData && feelingData.primary) || getSafeCssColor(feelingData && feelingData.color) || getSafeCssColor(feelingData && feelingData.bgcolor) || '#666666'
    const secondary = getSafeCssColor(feelingData && feelingData.secondary) || primary || '#999999'
    const accent = getSafeCssColor(feelingData && feelingData.accent) || '#cccccc'
    const text = getSafeCssColor(feelingData && feelingData.text) || '#ffffff'

    return {
        primary: primary,
        secondary: secondary,
        accent: accent,
        text: text
    }
}

function applyFeelingPaletteToNode(node, feelingData) {
    if (!node) return

    const palette = getFeelingPalette(feelingData)
    node.style.background = 'linear-gradient(135deg, ' + palette.primary + ', ' + palette.secondary + ')'
    node.style.color = palette.text
    node.style.borderLeft = '2px solid ' + palette.accent
    node.style.borderRight = '2px solid ' + palette.accent
}

let aboutSongObserversBound = false
const ABOUT_SONG_LINK_HORIZONTAL_INSET = 2

function getAboutSongTrackFallbackTitle(trackId, fallbackTitle) {
    const explicitTitle = getTrimmedString(fallbackTitle)
    if (explicitTitle) return explicitTitle

    const safeTrackId = getTrimmedString(trackId)
    if (!safeTrackId) return getAboutFallbackMessage()

    return safeTrackId
        .split(/[-_]+/)
        .filter(Boolean)
        .map(function(part) {
            return part.charAt(0).toUpperCase() + part.slice(1)
        })
        .join(' ')
}

function getAboutSongLayoutSnapshot(aboutTab) {
    if (!aboutTab) return 'missing'

    const isVisible = getComputedStyle(aboutTab).display !== 'none'
    const rect = aboutTab.getBoundingClientRect()

    return [
        isVisible ? 'visible' : 'hidden',
        Math.round(rect.width),
        Math.round(rect.height)
    ].join(':')
}

function setStaticAboutSongTitle(titleNode, displayTitle) {
    if (!titleNode) return

    titleNode.classList.remove('marquee')
    titleNode.style.removeProperty('--marquee-gap')
    titleNode.style.removeProperty('--marquee-shift')
    titleNode.style.removeProperty('--marquee-duration')
    titleNode.style.removeProperty('--now-playing-max-width')
    titleNode.innerHTML = ''
    titleNode.textContent = displayTitle
}

function updateAboutSongLink(linkNode) {
    if (!linkNode) return

    const titleNode = linkNode.querySelector('.about-desc-song-title')
    if (!titleNode) return

    const controls = window.musicPlayerControls
    const trackId = getTrimmedString(linkNode.dataset.aboutTrackId)
    const fallbackTitle = getAboutSongTrackFallbackTitle(trackId, linkNode.dataset.aboutSongFallback)
    const track = controls && typeof controls.getTrackById === 'function' && trackId
        ? controls.getTrackById(trackId)
        : null
    const displayTitle = track && typeof controls.formatTrackDisplayTitle === 'function'
        ? controls.formatTrackDisplayTitle(track)
        : fallbackTitle

    titleNode.title = displayTitle
    linkNode.title = displayTitle
    linkNode.setAttribute('aria-label', 'Play ' + displayTitle)

    if (controls && typeof controls.setOverflowTitle === 'function') {
        controls.setOverflowTitle(titleNode, displayTitle, {
            getAvailableWidth: function() {
                return Math.max(0, linkNode.clientWidth - (ABOUT_SONG_LINK_HORIZONTAL_INSET * 2))
            }
        })
        return
    }

    setStaticAboutSongTitle(titleNode, displayTitle)
}

function refreshAboutSongLinks() {
    const songLinks = document.querySelectorAll('.about-desc-song-link[data-about-track-id]')
    songLinks.forEach(function(linkNode) {
        updateAboutSongLink(linkNode)
    })
}

function openMusicFromAbout() {
    const tabsTaskbar = window.tabsTaskbar
    const aboutTab = document.getElementById('aboutTab')
    const musicTab = document.getElementById('musicTab')

    function positionMusicBehindAbout() {
        if (!aboutTab || !musicTab) return

        const aboutRect = aboutTab.getBoundingClientRect()
        const taskbar = document.querySelector('.taskbar')
        const taskbarHeight = taskbar ? taskbar.offsetHeight : 0
        const musicWidth = musicTab.offsetWidth
        const musicHeight = musicTab.offsetHeight

        if (musicWidth <= 0 || musicHeight <= 0) return

        const desiredCenterX = aboutRect.left + (aboutRect.width / 2) + 52
        const desiredCenterY = aboutRect.top + (aboutRect.height / 2) + 34
        const minCenterX = (musicWidth / 2) + 8
        const maxCenterX = window.innerWidth - (musicWidth / 2) - 8
        const minCenterY = (musicHeight / 2) + 8
        const maxCenterY = window.innerHeight - taskbarHeight - (musicHeight / 2) - 8
        const centerX = Math.min(maxCenterX, Math.max(minCenterX, desiredCenterX))
        const centerY = Math.min(maxCenterY, Math.max(minCenterY, desiredCenterY))

        musicTab.style.left = Math.round(centerX) + 'px'
        musicTab.style.top = Math.round(centerY) + 'px'
        musicTab.style.right = 'auto'
        musicTab.style.bottom = 'auto'
    }

    const wasHidden = musicTab ? getComputedStyle(musicTab).display === 'none' : false

    if (tabsTaskbar && typeof tabsTaskbar.openWindow === 'function') {
        tabsTaskbar.openWindow('musicTab')
        if (wasHidden) {
            positionMusicBehindAbout()
        }
        return
    }

    if (musicTab) {
        musicTab.style.display = 'block'
        if (wasHidden) {
            positionMusicBehindAbout()
        }
    }
}

function handleAboutSongLinkClick(event) {
    event.preventDefault()
    event.stopPropagation()

    const linkNode = event.currentTarget
    const trackId = getTrimmedString(linkNode && linkNode.dataset.aboutTrackId)
    if (!trackId) return

    openMusicFromAbout()

    const controls = window.musicPlayerControls
    if (controls && typeof controls.playTrackById === 'function') {
        controls.playTrackById(trackId)
        return
    }

    function playWhenReady() {
        window.removeEventListener('musicplayer:ready', playWhenReady)
        const readyControls = window.musicPlayerControls
        if (!readyControls || typeof readyControls.playTrackById !== 'function') return

        readyControls.playTrackById(trackId)
        refreshAboutSongLinks()
    }

    window.addEventListener('musicplayer:ready', playWhenReady)
}

function handleAboutSongLinkMouseDown(event) {
    event.stopPropagation()
}

function bindAboutSongObservers() {
    if (aboutSongObserversBound) return
    aboutSongObserversBound = true

    const aboutTab = document.getElementById('aboutTab')
    window.addEventListener('musicplayer:ready', refreshAboutSongLinks)
    window.addEventListener('resize', refreshAboutSongLinks)

    if (!aboutTab) return

    let lastLayoutSnapshot = getAboutSongLayoutSnapshot(aboutTab)

    function refreshWhenAboutLayoutChanges() {
        const nextLayoutSnapshot = getAboutSongLayoutSnapshot(aboutTab)
        if (nextLayoutSnapshot === lastLayoutSnapshot) return

        lastLayoutSnapshot = nextLayoutSnapshot
        refreshAboutSongLinks()
    }

    const observer = new MutationObserver(refreshWhenAboutLayoutChanges)

    observer.observe(aboutTab, { attributes: true, attributeFilter: ['style', 'class'] })

    if (typeof ResizeObserver === 'function') {
        const resizeObserver = new ResizeObserver(refreshWhenAboutLayoutChanges)
        resizeObserver.observe(aboutTab)
    }
}

function normalizeSkillScore(value) {
    const parsedValue = Number(value)

    if (!Number.isFinite(parsedValue)) return 0

    return Math.max(0, Math.min(10, Math.round(parsedValue)))
}

function syncSkillRating(rating) {
    if (!rating) return

    const score = normalizeSkillScore(rating.style.getPropertyValue('--skill-score'))
    const slash = '\\'
    let track = rating.querySelector('.about-skill-rating-track')
    let inactive = rating.querySelector('.about-skill-rating-track-inactive')
    let active = rating.querySelector('.about-skill-rating-track-active')
    let value = rating.querySelector('.about-skill-rating-value')

    if (!track || !inactive || !active || !value) {
        rating.textContent = ''

        track = document.createElement('span')
        track.className = 'about-skill-rating-track'
        track.setAttribute('aria-hidden', 'true')

        inactive = document.createElement('span')
        inactive.className = 'about-skill-rating-track-inactive'

        active = document.createElement('span')
        active.className = 'about-skill-rating-track-active'

        track.append(inactive, active)

        value = document.createElement('span')
        value.className = 'about-skill-rating-value'

        rating.append(track, value)
    }

    rating.style.setProperty('--skill-score', String(score))
    rating.setAttribute('aria-label', `${score} out of 10`)
    inactive.textContent = slash.repeat(10 - score)
    active.textContent = slash.repeat(score)
    value.textContent = `${score}/10`
}

function getSkillScore(listItem) {
    const rating = listItem && listItem.querySelector('.about-skill-rating')
    return normalizeSkillScore(rating && rating.style.getPropertyValue('--skill-score'))
}

function enhanceSkillPanel(skillPanel) {
    if (!skillPanel) return

    const ratings = skillPanel.querySelectorAll('.about-skill-rating')
    ratings.forEach(function(rating) {
        syncSkillRating(rating)
    })

    const skillLists = skillPanel.querySelectorAll('.about-list')
    skillLists.forEach(function(list) {
        const items = Array.from(list.children).filter(function(item) {
            return item && item.tagName === 'LI'
        })

        if (!items.length) return

        items
            .sort(function(a, b) {
                return getSkillScore(b) - getSkillScore(a)
            })
            .forEach(function(item) {
                list.appendChild(item)
            })
    })
}

function getAboutRoots() {
    return {
        desc: document.getElementById('aboutDesc') || document.querySelector('.about-desc'),
        panelAbout: document.getElementById('aboutPanelAbout') || document.querySelector('.about-panel--about'),
        panelInterests: document.getElementById('aboutPanelInterests') || document.querySelector('.about-panel--interests'),
        panelLove: document.getElementById('aboutPanelLove') || document.querySelector('.about-panel--love'),
        panelDislike: document.getElementById('aboutPanelDislike') || document.querySelector('.about-panel--dislike'),
        panelSkills: document.getElementById('aboutPanelSkills') || document.querySelector('.about-panel--skills')
    }
}

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName)
    if (className) element.className = className
    element.textContent = String(text || '')
    return element
}

function getAboutPath(value, fallbackValue) {
    const candidate = getTrimmedString(value)
    return candidate || fallbackValue
}

async function loadAboutJson(path, fallbackValue, label) {
    try {
        const response = await fetch(path, { cache: 'no-store' })
        if (!response.ok) throw new Error('Could not load ' + label)
        return await response.json()
    } catch (error) {
        console.warn('Using fallback ' + label + ':', error)
        return fallbackValue
    }
}

async function loadAboutData() {
    const fallbackData = getAboutFallbackData()
    const indexData = await loadAboutJson(ABOUT_INDEX_PATH, fallbackData.index, 'about index')
    const index = isPlainObject(indexData) ? indexData : fallbackData.index
    const panelFiles = isPlainObject(index.panelFiles) ? index.panelFiles : fallbackData.index.panelFiles
    const safeTabLabels = isPlainObject(index.tabLabels) ? index.tabLabels : fallbackData.index.tabLabels
    const profilePath = getAboutPath(index.profileFile, fallbackData.index.profileFile)

    const [profile, aboutPanel, interestsPanel, lovePanel, dislikePanel, skillsPanel] = await Promise.all([
        loadAboutJson(profilePath, fallbackData.profile, 'about profile'),
        loadAboutJson(getAboutPath(panelFiles.about, fallbackData.index.panelFiles.about), fallbackData.panels.about, 'about panel'),
        loadAboutJson(getAboutPath(panelFiles.interests, fallbackData.index.panelFiles.interests), fallbackData.panels.interests, 'about interests panel'),
        loadAboutJson(getAboutPath(panelFiles.love, fallbackData.index.panelFiles.love), fallbackData.panels.love, 'about love panel'),
        loadAboutJson(getAboutPath(panelFiles.dislike, fallbackData.index.panelFiles.dislike), fallbackData.panels.dislike, 'about dislike panel'),
        loadAboutJson(getAboutPath(panelFiles.skills, fallbackData.index.panelFiles.skills), fallbackData.panels.skills, 'about skills panel')
    ])

    return {
        index: {
            tabLabels: safeTabLabels
        },
        profile: isPlainObject(profile) ? profile : fallbackData.profile,
        panels: {
            about: isPlainObject(aboutPanel) ? aboutPanel : fallbackData.panels.about,
            interests: isPlainObject(interestsPanel) ? interestsPanel : fallbackData.panels.interests,
            love: isPlainObject(lovePanel) ? lovePanel : fallbackData.panels.love,
            dislike: isPlainObject(dislikePanel) ? dislikePanel : fallbackData.panels.dislike,
            skills: isPlainObject(skillsPanel) ? skillsPanel : fallbackData.panels.skills
        }
    }
}

function renderTabLabels(tabLabels) {
    const labelMap = {
        about: document.querySelector('label[for="aboutSubAbout"]'),
        interests: document.querySelector('label[for="aboutSubInterests"]'),
        love: document.querySelector('label[for="aboutSubLove"]'),
        dislike: document.querySelector('label[for="aboutSubDislike"]'),
        skills: document.querySelector('label[for="aboutSubSkills"]')
    }

    Object.keys(labelMap).forEach(function(key) {
        const label = labelMap[key]
        const value = getTrimmedString(tabLabels && tabLabels[key])

        if (label && value) {
            label.textContent = value
        }
    })
}

function getProfileSectionClassName(variant) {
    if (variant === 'identity') return 'about-desc-section about-desc-section--identity'
    if (variant === 'centered') return 'about-desc-section about-desc-section--centered'
    if (variant === 'song') return 'about-desc-section about-desc-section--inline about-desc-section--song'
    return 'about-desc-section about-desc-section--inline'
}

function renderProfileSection(section) {
    const variant = getTrimmedString(section && section.variant)
    const sectionNode = document.createElement('div')
    sectionNode.className = getProfileSectionClassName(variant)

    if (variant === 'identity') {
        sectionNode.appendChild(createTextElement('span', 'about-desc-value', section && section.value))
        return sectionNode
    }

    const label = getTrimmedString(section && section.label)
    if (label) {
        sectionNode.appendChild(createTextElement('span', 'about-desc-label', label))
    }

    if (variant === 'centered') {
        const mood = isPlainObject(section && section.mood) ? section.mood : {}
        const moodRow = document.createElement('div')
        moodRow.className = 'about-desc-mood-row'
        moodRow.appendChild(createTextElement('span', 'about-desc-mood-mark', mood.leftMark || ''))
        const moodValue = createTextElement('span', 'blog-feeling about-desc-feeling', mood.value || '')
        applyFeelingPaletteToNode(moodValue, mood)
        moodRow.appendChild(moodValue)
        moodRow.appendChild(createTextElement('span', 'about-desc-mood-mark', mood.rightMark || ''))
        sectionNode.appendChild(moodRow)
        return sectionNode
    }

    if (variant === 'song') {
        const songLink = document.createElement('button')
        songLink.type = 'button'
        songLink.className = 'about-desc-value about-desc-song-link'
        songLink.dataset.aboutTrackId = getTrimmedString(section && section.trackId)
        songLink.dataset.aboutSongFallback = getTrimmedString(section && section.value)

        const songTitle = document.createElement('span')
        songTitle.className = 'about-desc-song-title'
        songLink.appendChild(songTitle)
        songLink.addEventListener('mousedown', handleAboutSongLinkMouseDown)
        songLink.addEventListener('click', handleAboutSongLinkClick)
        sectionNode.appendChild(songLink)

        updateAboutSongLink(songLink)
        bindAboutSongObservers()
        return sectionNode
    }

    const valueNode = createTextElement('span', 'about-desc-value', section && section.value)
    const flag = getTrimmedString(section && section.flag)
    if (flag) {
        const flagNode = createTextElement('span', 'about-desc-flag', flag)
        flagNode.setAttribute('aria-label', getTrimmedString(section && section.flagLabel) || 'flag')
        valueNode.appendChild(flagNode)
    }

    sectionNode.appendChild(valueNode)
    return sectionNode
}

function renderProfile(descRoot, profileData) {
    if (!descRoot) return

    descRoot.innerHTML = ''

    const sections = Array.isArray(profileData && profileData.sections)
        ? profileData.sections.filter(function(section) {
            return isPlainObject(section)
        })
        : []

    sections.forEach(function(section) {
        descRoot.appendChild(renderProfileSection(section))
    })
}

function renderParagraphPanel(panelRoot, panelData) {
    if (!panelRoot) return

    panelRoot.innerHTML = ''

    const paragraphs = Array.isArray(panelData && panelData.paragraphs)
        ? panelData.paragraphs.filter(Boolean)
        : []

    paragraphs.forEach(function(paragraph) {
        panelRoot.appendChild(createTextElement('p', '', paragraph))
    })
}

function renderListPanel(panelRoot, panelData) {
    if (!panelRoot) return

    panelRoot.innerHTML = ''

    const list = document.createElement('ul')
    list.className = 'about-list'

    const items = Array.isArray(panelData && panelData.items) ? panelData.items.filter(Boolean) : []
    items.forEach(function(item) {
        list.appendChild(createTextElement('li', '', item))
    })

    panelRoot.appendChild(list)
}

function renderSkillItem(item) {
    const listItem = document.createElement('li')
    const score = item && item.score

    if (Number.isFinite(Number(score))) {
        const name = getTrimmedString(item && item.name)
        if (name) {
            listItem.appendChild(document.createTextNode(name + ' '))
        }

        const rating = document.createElement('span')
        rating.className = 'about-skill-rating'
        rating.style.setProperty('--skill-score', String(normalizeSkillScore(score)))
        rating.setAttribute('aria-label', `${normalizeSkillScore(score)} out of 10`)
        listItem.appendChild(rating)
        return listItem
    }

    const text = getTrimmedString(item && (item.text || item.name))
    const highlight = getTrimmedString(item && item.highlight)

    if (text) {
        listItem.appendChild(document.createTextNode(highlight ? text + ' ' : text))
    }

    if (highlight) {
        listItem.appendChild(createTextElement('span', 'about-skill-highlight', highlight))
    }

    return listItem
}

function renderSkillsPanel(panelRoot, panelData) {
    if (!panelRoot) return

    panelRoot.innerHTML = ''

    const groups = Array.isArray(panelData && panelData.groups)
        ? panelData.groups.filter(function(group) {
            return isPlainObject(group)
        })
        : []

    groups.forEach(function(group) {
        const groupNode = document.createElement('div')
        groupNode.className = 'about-skill-group'

        const title = getTrimmedString(group.title)
        if (title) {
            groupNode.appendChild(createTextElement('h3', '', title))
        }

        const list = document.createElement('ul')
        list.className = 'about-list'

        const items = Array.isArray(group.items) ? group.items.filter(Boolean) : []
        items.forEach(function(item) {
            list.appendChild(renderSkillItem(isPlainObject(item) ? item : { text: item }))
        })

        groupNode.appendChild(list)
        panelRoot.appendChild(groupNode)
    })

    enhanceSkillPanel(panelRoot)
}

function renderAboutData(roots, aboutData) {
    renderTabLabels(aboutData.index && aboutData.index.tabLabels)
    renderProfile(roots.desc, aboutData.profile)
    renderParagraphPanel(roots.panelAbout, aboutData.panels && aboutData.panels.about)
    renderParagraphPanel(roots.panelInterests, aboutData.panels && aboutData.panels.interests)
    renderListPanel(roots.panelLove, aboutData.panels && aboutData.panels.love)
    renderListPanel(roots.panelDislike, aboutData.panels && aboutData.panels.dislike)
    renderSkillsPanel(roots.panelSkills, aboutData.panels && aboutData.panels.skills)
}

async function initAboutTab() {
    const roots = getAboutRoots()

    if (!roots.desc || !roots.panelAbout || !roots.panelInterests || !roots.panelLove || !roots.panelDislike || !roots.panelSkills) {
        return
    }

    const aboutData = await loadAboutData()
    renderAboutData(roots, aboutData)
}

window.initAboutTab = initAboutTab