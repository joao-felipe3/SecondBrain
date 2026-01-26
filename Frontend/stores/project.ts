import { defineStore } from 'pinia'
import type { Project } from '~/models/Project'

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as Project[],
    isLoading: false,
  }),

  getters: {
    projectColors: (state) => state.projects.map((p: Project) => p.color || '#D2B48C'),
    
    getProjectById: (state) => (id: string) => 
      state.projects.find((p: Project) => (p._id ?? p.id) === id),
    
    projectCount: (state) => state.projects.length,
  },

  actions: {
    async loadProjects() {
      this.isLoading = true
      
      try {
        const response = await fetch('http://localhost:3000/projects')
        const data = await response.json()
        this.projects = Array.isArray(data) ? data : []
        await this.loadTaskCounts()
      } catch (error) {
        console.error('Failed to load projects', error)
      }
      
      this.isLoading = false
    },

    async loadTaskCounts() {
      for (const project of this.projects) {
        try {
          const response = await fetch(`http://localhost:3000/projects/${project._id}/tasks`)
          const tasks = await response.json()
          project.taskCount = tasks.length
        } catch (error) {
          console.error(`Failed to load task count for project ${project._id}`, error)
          project.taskCount = 0
        }
      }
    },

    async createProject(newProject: Partial<Project>) {
      try {
        const response = await fetch('http://localhost:3000/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newProject)
        })
        const data = await response.json()
        
        if (response.ok) {
          this.projects.push(data)
          return data
        } else {
          console.error('Error creating project:', data)
          return null
        }
      } catch (error) {
        console.error('Error creating project:', error)
        return null
      }
    },

    async updateProject(id: string, updates: Partial<Project>) {
      try {
        const response = await fetch(`http://localhost:3000/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        })
        const data = await response.json()
        
        if (response.ok) {
          const idx = this.projects.findIndex((p: Project) => (p._id ?? p.id) === id)
          if (idx >= 0) {
            this.projects[idx] = { ...this.projects[idx], ...data }
          }
          return data
        } else {
          console.error('Error updating project:', data)
          return null
        }
      } catch (error) {
        console.error('Error updating project:', error)
        return null
      }
    },

    addOrUpdateProject(project: Project) {
      if (!project) return
      const id = project._id ?? project.id
      const idx = this.projects.findIndex((p: Project) => (p._id ?? p.id) === id)
      
      if (idx >= 0) {
        this.projects[idx] = { ...this.projects[idx], ...project }
      } else {
        this.projects.push(project)
      }
    },

    async deleteProject(projectId: string, deleteTasks: boolean = false) {
      try {
        const response = await fetch(
          `http://localhost:3000/projects/${projectId}?deleteTasks=${deleteTasks}`,
          { method: 'DELETE' }
        )

        if (!response.ok) {
          throw new Error('Failed to delete project')
        }

        this.projects = this.projects.filter((p: Project) => p._id !== projectId)
        return await response.json()
      } catch (error) {
        console.error('Error deleting project:', error)
        throw error
      }
    },

    removeProjectById(projectId: string) {
      this.projects = this.projects.filter((p: Project) => p._id !== projectId)
    },
  }
})
