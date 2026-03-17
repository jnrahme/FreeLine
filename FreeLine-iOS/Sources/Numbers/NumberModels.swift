import Foundation

struct AvailableNumberOption: Codable, Equatable {
    let phoneNumber: String
    let nationalFormat: String
    let locality: String
    let region: String
    let provider: String

    var areaCode: String {
        String(phoneNumber.dropFirst(2).prefix(3))
    }
}

struct AssignedNumber: Codable, Equatable {
    let assignmentId: String
    let assignedAt: String
    let activationDeadline: String
    let areaCode: String
    let externalId: String
    let locality: String
    let nationalFormat: String
    let phoneNumber: String
    let phoneNumberId: String
    let provider: String
    let quarantineUntil: String?
    let region: String
    let releasedAt: String?
    let status: String
    let userId: String
}
