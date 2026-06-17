class InfrastructureUnavailable(Exception):
    """Raised when an infrastructure dependency cannot be reached.

    Infrastructure adapters (repositories, ACL adapters) catch their own
    low-level errors and wrap them in this type so the API layer can map
    all infra failures to 503 without leaking internal details to clients.
    """

    def __init__(self, dependency: str, cause: Exception) -> None:
        self.dependency = dependency
        self.cause = cause
        super().__init__(f"{dependency} unavailable: {cause}")
