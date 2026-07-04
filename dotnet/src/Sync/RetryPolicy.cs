namespace EsignMico360.Sync;

/// <summary>
/// Retries a transient operation with exponential backoff + jitter. Because every
/// sync operation is idempotent (keyed by GUID Id), a retry can never duplicate
/// data — it either completes the same effect or is a no-op.
/// </summary>
public static class RetryPolicy
{
    public static async Task<T> ExecuteAsync<T>(
        Func<Task<T>> operation,
        int maxAttempts = 5,
        int baseDelayMs = 50,
        Func<Exception, bool>? isTransient = null,
        Func<int, Task>? onRetry = null,
        Random? rng = null)
    {
        rng ??= Random.Shared;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await operation();
            }
            catch (Exception ex) when (attempt < maxAttempts && (isTransient?.Invoke(ex) ?? true))
            {
                var delay = (int)(baseDelayMs * Math.Pow(2, attempt - 1)) + rng.Next(0, baseDelayMs);
                if (onRetry != null) await onRetry(attempt);
                await Task.Delay(delay);
            }
        }
    }
}
