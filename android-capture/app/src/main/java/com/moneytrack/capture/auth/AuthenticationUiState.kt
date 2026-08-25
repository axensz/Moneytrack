package com.moneytrack.capture.auth

data class AuthenticationUiState(
    val inProgress: Boolean = false,
    val failure: AuthenticationResult? = null,
) {
    fun begin(): AuthenticationUiState? =
        if (inProgress) null else AuthenticationUiState(inProgress = true)

    fun complete(result: AuthenticationResult): AuthenticationUiState =
        AuthenticationUiState(
            failure = result.takeIf {
                it == AuthenticationResult.CONFIGURATION_MISSING ||
                    it == AuthenticationResult.FAILED
            },
        )
}
