import axios from 'axios'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()

  const api = axios.create({
    baseURL: config.public.apiBase || 'http://localhost:3000',
  })

  nuxtApp.provide('api', api)
})
