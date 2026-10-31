import Foundation

/// Service for user authentication handling both REST API network operations and offline database fallback.
final class AuthAPIService {
    static let shared = AuthAPIService()
    
    private var baseURL: URL {
        ConcallAPIService.shared.baseURL
    }
    
    // Check if backend API server is reachable
    func checkServerHealth() async -> Bool {
        let healthURL = baseURL.appendingPathComponent("api/health")
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 1.5
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                return true
            }
            return false
        } catch {
            return false
        }
    }
    
    // Authenticate user via REST API or local database fallback
    func login(email: String, password: String) async throws -> (user: UserProfile, isOnline: Bool) {
        let isOnline = await checkServerHealth()
        
        if isOnline {
            do {
                let loginURL = baseURL.appendingPathComponent("api/auth/login")
                var request = URLRequest(url: loginURL)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.timeoutInterval = 3.0
                
                let payload = ["email": email, "password": password]
                request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw AuthError.serverUnreachable
                }
                
                if http.statusCode == 200 {
                    let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
                    if let user = authResponse.user {
                        return (user, true)
                    }
                } else {
                    // Decode error message from server
                    if let errorObj = try? JSONDecoder().decode(AuthErrorResponse.self, from: data),
                       let msg = errorObj.message {
                        if http.statusCode == 401 && msg.localizedCaseInsensitiveContains("Incorrect password") {
                            throw AuthError.invalidPassword
                        } else if http.statusCode == 401 && msg.localizedCaseInsensitiveContains("No account found") {
                            throw AuthError.userNotFound
                        } else {
                            throw NSError(domain: "Auth", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
                        }
                    }
                }
            } catch let err as AuthError {
                throw err
            } catch {
                // Network failed mid-request; fall back to local database
            }
        }
        
        // Local database fallback
        let localUser = try LocalUserDatabase.shared.loginUser(email: email, password: password)
        return (localUser, false)
    }
    
    // Register a new user account in database (remote and local)
    func register(name: String, email: String, password: String) async throws -> (user: UserProfile, isOnline: Bool) {
        let isOnline = await checkServerHealth()
        
        if isOnline {
            do {
                let registerURL = baseURL.appendingPathComponent("api/auth/register")
                var request = URLRequest(url: registerURL)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.timeoutInterval = 3.0
                
                let payload = ["name": name, "email": email, "password": password]
                request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw AuthError.serverUnreachable
                }
                
                if http.statusCode == 201 {
                    let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
                    if let user = authResponse.user {
                        // Also sync to local database
                        _ = try? LocalUserDatabase.shared.registerUser(name: name, email: email, password: password)
                        return (user, true)
                    }
                } else if http.statusCode == 409 {
                    throw AuthError.emailAlreadyExists
                } else {
                    if let errorObj = try? JSONDecoder().decode(AuthErrorResponse.self, from: data),
                       let msg = errorObj.message {
                        throw NSError(domain: "Auth", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
                    }
                }
            } catch let err as AuthError {
                throw err
            } catch {
                // Network failure, continue to local registration
            }
        }
        
        // Local database registration
        let localUser = try LocalUserDatabase.shared.registerUser(name: name, email: email, password: password)
        return (localUser, false)
    }
}
