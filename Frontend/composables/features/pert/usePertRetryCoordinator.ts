type ScheduleTokenRetryParams = {
  retryAttempt: number
  maxRetries: number
  delayMs: number
  isTokenCurrent: () => boolean
  onRetry: (nextRetryAttempt: number) => void
}

type HandleHiddenContainerRetryParams = {
  containerWidth: number
  containerHeight: number
  retryAttempt: number
  isTokenCurrent: () => boolean
  onRetry: (nextRetryAttempt: number) => void
  minContainerSize?: number
}

type HandleInvalidGeometryRetryParams = {
  invalidGeometry: boolean
  retryAttempt: number
  isTokenCurrent: () => boolean
  onRetry: (nextRetryAttempt: number) => void
}

export const usePertRetryCoordinator = () => {
  const scheduleTokenRetry = ({
    retryAttempt,
    maxRetries,
    delayMs,
    isTokenCurrent,
    onRetry,
  }: ScheduleTokenRetryParams) => {
    if (retryAttempt >= maxRetries) return false

    setTimeout(() => {
      if (!isTokenCurrent()) return
      onRetry(retryAttempt + 1)
    }, delayMs)

    return true
  }

  const handleHiddenContainerRetry = ({
    containerWidth,
    containerHeight,
    retryAttempt,
    isTokenCurrent,
    onRetry,
    minContainerSize = 40,
  }: HandleHiddenContainerRetryParams) => {
    const isHidden = containerWidth < minContainerSize || containerHeight < minContainerSize
    if (!isHidden) {
      return {
        containerReady: true,
        retryScheduled: false,
      }
    }

    const retryScheduled = scheduleTokenRetry({
      retryAttempt,
      maxRetries: 6,
      delayMs: 160,
      isTokenCurrent,
      onRetry,
    })

    return {
      containerReady: false,
      retryScheduled,
    }
  }

  const handleInvalidGeometryRetry = ({
    invalidGeometry,
    retryAttempt,
    isTokenCurrent,
    onRetry,
  }: HandleInvalidGeometryRetryParams) => {
    if (!invalidGeometry) {
      return {
        shouldReturn: false,
        retryScheduled: false,
      }
    }

    const retryScheduled = scheduleTokenRetry({
      retryAttempt,
      maxRetries: 2,
      delayMs: 120,
      isTokenCurrent,
      onRetry,
    })

    return {
      shouldReturn: retryScheduled,
      retryScheduled,
    }
  }

  return {
    handleHiddenContainerRetry,
    handleInvalidGeometryRetry,
  }
}
