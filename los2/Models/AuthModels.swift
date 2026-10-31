import Foundation

/// Authenticated user profile representation.
struct UserProfile: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let email: String
    let createdAt: String?
}

/// Server authentication response payload.
struct AuthResponse: Codable {
    let success: Bool
    let message: String?
    let user: UserProfile?
    let token: String?
}

/// Server authentication error response payload.
struct AuthErrorResponse: Codable {
    let success: Bool
    let error: String?
    let message: String?
}
