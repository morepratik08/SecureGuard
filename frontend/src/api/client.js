import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

let accessToken = null
let unauthorizedHandler = () => {}

export function setAccessToken(token) {
  accessToken = token || null
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler || (() => {})
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  else delete config.headers.Authorization
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) unauthorizedHandler()
    if (error.response?.status === 403) error.userMessage = 'You do not have permission to perform this action.'
    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error.response?.status === 403) return error.userMessage || 'You do not have permission to perform this action.'
  return error.response?.data?.message || fallback
}
