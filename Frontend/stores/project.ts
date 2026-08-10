import { defineStore } from "pinia";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import type { Project } from "~/models/Project";

export const useProjectStore = defineStore("project", {
  state: () => ({
    projects: [] as Project[],
    isLoading: false,
  }),

  getters: {
    projectColors: (state) =>
      state.projects.map((p: Project) => p.color || "#D2B48C"),

    getProjectById: (state) => (id: string) =>
      state.projects.find((p: Project) => (p._id ?? p.id) === id),

    projectCount: (state) => state.projects.length,
  },

  actions: {
    async loadProjects() {
      this.isLoading = true;
      const api = useProjectsApi();

      try {
        const { data, error } = await api.list();
        if (error) {
          console.error("Failed to load projects", error);
        } else {
          this.projects = Array.isArray(data) ? data : [];
          await this.loadTaskCounts();
        }
      } catch (error) {
        console.error("Failed to load projects", error);
      }

      this.isLoading = false;
    },

    async loadTaskCounts() {
      const api = useProjectsApi();
      for (const project of this.projects) {
        try {
          const id = project._id ?? project.id;
          if (!id) continue;
          const { data, error } = await api.fetchProjectTasks(String(id));
          project.taskCount = !error && Array.isArray(data) ? data.length : 0;
        } catch (error) {
          console.error(
            `Failed to load task count for project ${project._id}`,
            error,
          );
          project.taskCount = 0;
        }
      }
    },

    async createProject(newProject: Partial<Project>) {
      const api = useProjectsApi();
      try {
        const { data, error } = await api.create(newProject);

        if (!error && data) {
          this.projects.push(data);
          return data;
        } else {
          console.error("Error creating project:", error);
          return null;
        }
      } catch (error) {
        console.error("Error creating project:", error);
        return null;
      }
    },

    async updateProject(id: string, updates: Partial<Project>) {
      const api = useProjectsApi();
      try {
        const { data, error } = await api.update(id, updates);

        if (!error && data) {
          const idx = this.projects.findIndex(
            (p: Project) => (p._id ?? p.id) === id,
          );
          if (idx >= 0) {
            this.projects[idx] = { ...this.projects[idx], ...data };
          }
          return data;
        } else {
          console.error("Error updating project:", error);
          return null;
        }
      } catch (error) {
        console.error("Error updating project:", error);
        return null;
      }
    },

    addOrUpdateProject(project: Project) {
      if (!project) return;
      const id = project._id ?? project.id;
      const idx = this.projects.findIndex(
        (p: Project) => (p._id ?? p.id) === id,
      );

      if (idx >= 0) {
        this.projects[idx] = { ...this.projects[idx], ...project };
      } else {
        this.projects.push(project);
      }
    },

    async deleteProject(projectId: string, _deleteTasks: boolean = false) {
      const api = useProjectsApi();
      try {
        const { data, error } = await api.remove(projectId);

        if (error) {
          throw new Error("Failed to delete project");
        }

        this.projects = this.projects.filter(
          (p: Project) => (p._id ?? p.id) !== projectId,
        );
        return data;
      } catch (error) {
        console.error("Error deleting project:", error);
        throw error;
      }
    },

    removeProjectById(projectId: string) {
      this.projects = this.projects.filter(
        (p: Project) => (p._id ?? p.id) !== projectId,
      );
    },
  },
});
