function getProjectsFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || "data couldn't be found - working on it..."
}

function initProjectsTab() {
    const grid = document.getElementById('projectsGrid')
    const detail = document.getElementById('projectDetail')
    const detailEmpty = document.getElementById('projectDetailEmpty')
    const detailCard = document.getElementById('projectDetailCard')
    const detailTitle = document.getElementById('projectDetailTitle')
    const detailDescription = document.getElementById('projectDetailDescription')
    const detailLink = document.getElementById('projectDetailLink')

    if (!grid || !detail || !detailEmpty || !detailCard || !detailTitle || !detailDescription || !detailLink) return

    function getFallbackProjectData() {
        const message = getProjectsFallbackMessage()

        return {
            githubAccount: 'https://github.com/mishhu0',
            projects: [
                {
                    id: 'project-fallback',
                    title: message,
                    description: message,
                    github: 'WIP'
                }
            ]
        }
    }

    function getSafeProjectData(data) {
        const fallbackProjectData = getFallbackProjectData()
        const source = data && typeof data === 'object' ? data : fallbackProjectData
        const projects = Array.isArray(source.projects)
            ? source.projects.filter(function(project) {
                return project && project.id && project.title
            })
            : fallbackProjectData.projects

        return {
            githubAccount: String(source.githubAccount || fallbackProjectData.githubAccount || '').trim() || fallbackProjectData.githubAccount,
            projects: projects
        }
    }

    async function loadProjectData() {
        try {
            const response = await fetch('misc/projects.json', { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load projects data')

            const json = await response.json()
            return getSafeProjectData(json)
        } catch (error) {
            console.warn('Using fallback projects data:', error)
            return getSafeProjectData(fallbackProjectData)
        }
    }

    function getProjectLinkState(project, githubAccount) {
        const rawGithub = String(project && project.github || '').trim()

        if (rawGithub.toUpperCase() === 'WIP') {
            return {
                href: githubAccount,
                label: 'WIP'
            }
        }

        return {
            href: rawGithub || githubAccount,
            label: 'github repo'
        }
    }

    function renderProjects(projectData) {
        grid.innerHTML = ''

        const projects = Array.isArray(projectData && projectData.projects) ? projectData.projects : []

        if (!projects.length) {
            detail.classList.remove('is-expanded')
            detailEmpty.style.display = 'flex'
            detailCard.setAttribute('aria-hidden', 'true')

            const detailEmptyTitle = detailEmpty.querySelector('h2')
            const detailEmptyCopy = detailEmpty.querySelector('p')
            if (detailEmptyTitle) detailEmptyTitle.textContent = getProjectsFallbackMessage()
            if (detailEmptyCopy) detailEmptyCopy.textContent = ''
            return
        }

        projects.forEach(function(project) {
            const card = document.createElement('button')
            card.type = 'button'
            card.className = 'project-tile'
            card.dataset.projectId = project.id

            const title = document.createElement('span')
            title.className = 'project-tile-title'
            title.textContent = project.title

            card.appendChild(title)
            card.addEventListener('click', function() {
                showProject(project, projectData)
                setActiveTile(project.id)
            })

            grid.appendChild(card)
        })
    }

    function setActiveTile(projectId) {
        const cards = grid.querySelectorAll('.project-tile')
        cards.forEach(function(card) {
            card.classList.toggle('is-active', card.dataset.projectId === projectId)
        })
    }

    function showProject(project, projectData) {
        detail.classList.add('is-expanded')
        detailEmpty.style.display = 'none'
        detailCard.setAttribute('aria-hidden', 'false')

        detailTitle.textContent = project.title
    detailDescription.textContent = project.description || getProjectsFallbackMessage()
        const linkState = getProjectLinkState(project, projectData && projectData.githubAccount)
        detailLink.href = linkState.href
        detailLink.textContent = linkState.label
    }

    loadProjectData().then(function(projectData) {
        renderProjects(projectData)
    })
}
