export const useTasks = () => {
  const fetchTasks = async () => {
    try {
      const response = await fetch('http://localhost:3000/tasks')
      if (!response.ok) throw new Error('Failed to fetch tasks')
      return await response.json()
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err)
      return []
    }
  }

  return {
    fetchTasks
  }
}
