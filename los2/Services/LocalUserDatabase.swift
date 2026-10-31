import Foundation
import CryptoKit

/// Local persistent database for offline and resilient user account storage.
/// Hashes credentials using SHA-256 with unique per-user salts.
final class LocalUserDatabase {
    static let shared = LocalUserDatabase()
    
    private let databaseFileName = "local_users.json"
    
    private struct StoredUser: Codable {
        let id: String
        let name: String
        let email: String
        let salt: String
        let passwordHash: String
        let createdAt: String
    }
    
    private var fileURL: URL {
        let paths = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        let directory = paths[0].appendingPathComponent("FinSight", isDirectory: true)
        if !FileManager.default.fileExists(atPath: directory.path) {
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            // Migrate legacy database if exists
            let legacyDir = paths[0].appendingPathComponent("LiquidityOS", isDirectory: true)
            let legacyFile = legacyDir.appendingPathComponent(databaseFileName)
            let newFile = directory.appendingPathComponent(databaseFileName)
            if FileManager.default.fileExists(atPath: legacyFile.path) && !FileManager.default.fileExists(atPath: newFile.path) {
                try? FileManager.default.copyItem(at: legacyFile, to: newFile)
            }
        }
        return directory.appendingPathComponent(databaseFileName)
    }
    
    init() {
        seedInitialAccountsIfNeeded()
    }
    
    // Hash password using CryptoKit SHA256 + salt
    private func hashPassword(_ password: String, salt: String) -> String {
        let combined = "\(salt):\(password)"
        let digest = SHA256.hash(data: Data(combined.utf8))
        return digest.compactMap { String(format: "%02x", $0) }.joined()
    }
    
    private func seedInitialAccountsIfNeeded() {
        let users = loadUsers()
        if users.isEmpty {
            let demoSalt = UUID().uuidString
            let demoHash = hashPassword("password123", salt: demoSalt)
            
            let adminSalt = UUID().uuidString
            let adminHash = hashPassword("admin123", salt: adminSalt)
            
            let initial = [
                StoredUser(
                    id: "usr_demo",
                    name: "Demo Investor",
                    email: "user@gmail.com",
                    salt: demoSalt,
                    passwordHash: demoHash,
                    createdAt: ISO8601DateFormatter().string(from: Date())
                ),
                StoredUser(
                    id: "usr_admin",
                    name: "System Admin",
                    email: "admin@gmail.com",
                    salt: adminSalt,
                    passwordHash: adminHash,
                    createdAt: ISO8601DateFormatter().string(from: Date())
                )
            ]
            saveUsers(initial)
        }
    }
    
    private func loadUsers() -> [StoredUser] {
        guard let data = try? Data(contentsOf: fileURL),
              let users = try? JSONDecoder().decode([StoredUser].self, from: data) else {
            return []
        }
        return users
    }
    
    private func saveUsers(_ users: [StoredUser]) {
        if let data = try? JSONEncoder().encode(users) {
            try? data.write(to: fileURL)
        }
    }
    
    // MARK: - Public API
    
    func registerUser(name: String, email: String, password: String) throws -> UserProfile {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? cleanEmail.components(separatedBy: "@").first ?? "Investor"
            : name.trimmingCharacters(in: .whitespacesAndNewlines)
        
        var users = loadUsers()
        if users.contains(where: { $0.email.lowercased() == cleanEmail }) {
            throw AuthError.emailAlreadyExists
        }
        
        let salt = UUID().uuidString
        let hash = hashPassword(password, salt: salt)
        let now = ISO8601DateFormatter().string(from: Date())
        let newUser = StoredUser(
            id: "usr_\(UUID().uuidString.prefix(8))",
            name: cleanName,
            email: cleanEmail,
            salt: salt,
            passwordHash: hash,
            createdAt: now
        )
        
        users.append(newUser)
        saveUsers(users)
        
        return UserProfile(id: newUser.id, name: newUser.name, email: newUser.email, createdAt: newUser.createdAt)
    }
    
    func loginUser(email: String, password: String) throws -> UserProfile {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let users = loadUsers()
        
        guard let user = users.first(where: { $0.email.lowercased() == cleanEmail }) else {
            throw AuthError.userNotFound
        }
        
        let computedHash = hashPassword(password, salt: user.salt)
        guard computedHash == user.passwordHash else {
            throw AuthError.invalidPassword
        }
        
        return UserProfile(id: user.id, name: user.name, email: user.email, createdAt: user.createdAt)
    }
    
    func getAllRegisteredEmails() -> [String] {
        return loadUsers().map { $0.email }
    }
}

enum AuthError: LocalizedError {
    case emailAlreadyExists
    case userNotFound
    case invalidPassword
    case invalidEmailFormat
    case passwordTooShort
    case passwordsDoNotMatch
    case serverUnreachable
    
    var errorDescription: String? {
        switch self {
        case .emailAlreadyExists:
            return "An account with this email address already exists. Please sign in instead."
        case .userNotFound:
            return "No account found with this email. Please check your spelling or create an account."
        case .invalidPassword:
            return "Incorrect password. Please verify and try again."
        case .invalidEmailFormat:
            return "Please enter a valid email address (e.g. user@gmail.com)."
        case .passwordTooShort:
            return "Password must be at least 6 characters long."
        case .passwordsDoNotMatch:
            return "Passwords do not match. Please re-enter to confirm."
        case .serverUnreachable:
            return "Authentication server unreachable. Switched to local offline database."
        }
    }
}
