import SwiftUI

struct MainMatchingView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var matchingVM: MatchingViewModel
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("你好，\(authVM.currentUser.flatMap { _ in nil } ?? "同学")")
                                .font(.system(size: 22, weight: .bold))
                            Text(Date(), style: .date)
                                .font(.caption).foregroundColor(.secondary)
                        }
                        Spacer()
                        Button(action: authVM.logout) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    
                    if matchingVM.isLoading {
                        ProgressView().padding(.top, 60)
                    } else {
                        // Status Card
                        matchStatusCard
                        
                        // Match Result
                        if matchingVM.isMatched {
                            matchResultCard
                        }
                    }
                }
                .padding(.bottom, 32)
            }
            .navigationBarHidden(true)
            .refreshable { await matchingVM.loadAll() }
            .task { await matchingVM.loadAll() }
        }
    }
    
    // MARK: - Status Card
    private var matchStatusCard: some View {
        VStack(spacing: 0) {
            // Mode indicator
            HStack {
                ZStack {
                    Circle().fill(matchingVM.isInRelationship ? Color.pink.opacity(0.15) : Color.blue.opacity(0.1)).frame(width: 56, height: 56)
                    Image(systemName: matchingVM.isInRelationship ? "sparkles" : "magnifyingglass")
                        .font(.system(size: 26))
                        .foregroundColor(matchingVM.isInRelationship ? Color(red: 1, green: 0.4, blue: 0.5) : .blue)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(matchingVM.isInRelationship ? "恋爱模式" : "匹配模式")
                        .font(.system(size: 18, weight: .semibold))
                    Text(matchingVM.isInRelationship ? "你已找到你的伴侣" : "正在为你寻找最合适的人")
                        .font(.subheadline).foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(20)
            
            Divider().padding(.horizontal, 20)
            
            // Next match time
            if let config = matchingVM.matchStatus?.matchConfig {
                HStack {
                    Image(systemName: "clock").foregroundColor(.secondary).font(.subheadline)
                    Text("下次匹配：\(config.description ?? config.cronExpr)")
                        .font(.subheadline).foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
        }
        .background(Color.white)
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 10, x: 0, y: 4)
        .padding(.horizontal, 20)
    }
    
    // MARK: - Match Result Card
    private var matchResultCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("匹配成功！").font(.system(size: 20, weight: .bold))
            
            if let partner = matchingVM.matchResult?.partner {
                VStack(spacing: 12) {
                    // Avatar placeholder
                    Circle().fill(Color(red: 1, green: 0.94, blue: 0.96))
                        .frame(width: 72, height: 72)
                        .overlay(Text(String(partner.nickname?.prefix(1) ?? "?")).font(.system(size: 30)))
                    
                    Text(partner.nickname ?? "神秘用户")
                        .font(.system(size: 22, weight: .semibold))
                    
                    HStack(spacing: 16) {
                        if let school = partner.school {
                            Label(school, systemImage: "graduationcap").font(.subheadline).foregroundColor(.secondary)
                        }
                        if let age = partner.age {
                            Label("\(age) 岁", systemImage: "person").font(.subheadline).foregroundColor(.secondary)
                        }
                        if let city = partner.city {
                            Label(city, systemImage: "location").font(.subheadline).foregroundColor(.secondary)
                        }
                    }
                    
                    if let interests = partner.interests, !interests.isEmpty {
                        HStack {
                            ForEach(interests.prefix(4), id: \.self) { tag in
                                Text(tag).font(.caption).padding(.horizontal, 10).padding(.vertical, 4)
                                    .background(Color(red: 1, green: 0.94, blue: 0.96))
                                    .foregroundColor(Color(red: 1, green: 0.30, blue: 0.43))
                                    .cornerRadius(20)
                            }
                        }
                    }
                    
                    if let bio = partner.bio, !bio.isEmpty {
                        Text(bio).font(.subheadline).foregroundColor(.secondary)
                            .multilineTextAlignment(.center).lineLimit(3)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            
            // Relationship mode notice
            Text("你们已进入恋爱模式，更多功能即将开放")
                .font(.caption).foregroundColor(.secondary)
                .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                .padding(.vertical, 12).background(Color(.systemGray6)).cornerRadius(10)
        }
        .padding(20)
        .background(Color.white)
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 10, x: 0, y: 4)
        .padding(.horizontal, 20)
    }
}
