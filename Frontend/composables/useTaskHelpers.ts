export default function useTaskHelpers() {
  function createNewTask() {
    return {
      _id: null,
      name: null,
      description: null,
      pomodorosPlanned: null,
      deadline: null,
      priority: 1,
      difficult: 1,
      project: null,
      experience: 20,
      isConcluded: false,
      late: false,
      prize: 50,
      recurrency: null,
      notification: null,
    }
  }

  return { createNewTask }
}
