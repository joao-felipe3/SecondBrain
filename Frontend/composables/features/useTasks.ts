export const useTasks = () => {
  const fetchTasks = async () => {
    try {
      const { data, error } = await useFetch('http://localhost:3000/tasks')
      if (error.value) throw error.value
      return data.value
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err)
      return []
    }
  }

  return {
    fetchTasks
  }
}
