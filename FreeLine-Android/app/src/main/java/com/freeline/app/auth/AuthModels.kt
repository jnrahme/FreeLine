package com.freeline.app.auth

data class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresAt: String,
    val refreshTokenExpiresAt: String,
)

data class AuthenticatedUser(
    val id: String,
    val email: String,
    val displayName: String?,
)

data class AuthSessionPayload(
    val tokens: AuthTokens,
    val user: AuthenticatedUser,
)

data class PendingEmailVerification(
    val email: String,
    val previewLink: String,
    val suggestedToken: String,
)

enum class AuthScreen {
    Welcome,
    Email,
}

enum class DevAuthProvider(
    val routeName: String,
    val buttonTitle: String,
    val displayName: String,
) {
    Apple(
        routeName = "apple",
        buttonTitle = "Continue with Apple (Dev)",
        displayName = "Apple Dev",
    ),
    Google(
        routeName = "google",
        buttonTitle = "Continue with Google (Dev)",
        displayName = "Google Dev",
    ),
}
