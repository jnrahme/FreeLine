import Foundation

struct AuthTokens: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let accessTokenExpiresAt: String
    let refreshTokenExpiresAt: String
}

struct AuthenticatedUser: Codable, Equatable {
    let id: String
    let email: String
    let displayName: String?
}

struct AuthSessionPayload: Codable, Equatable {
    let tokens: AuthTokens
    let user: AuthenticatedUser
}

struct PendingEmailVerification: Equatable {
    let email: String
    let previewLink: String
    let suggestedToken: String
}

enum DevAuthProvider: String {
    case apple
    case google

    var buttonTitle: String {
        switch self {
        case .apple:
            return "Continue with Apple (Dev)"
        case .google:
            return "Continue with Google (Dev)"
        }
    }

    var displayName: String {
        switch self {
        case .apple:
            return "Apple Dev"
        case .google:
            return "Google Dev"
        }
    }
}

enum AuthScreen {
    case welcome
    case email
}
