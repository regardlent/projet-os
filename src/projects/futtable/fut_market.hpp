// fut_market.hpp — core smart-spreadsheet model for FUT (EA FC 26) buy/resell analysis.
// Header-only C++17. Pure logic: player definition + investment scoring. No GUI here.
#pragma once
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace fut {

using Coins = double;

enum class Position { GK, DEF, MID, ATT, UNKNOWN };

inline std::string posName(Position p) {
	switch (p) { case Position::GK: return "GK"; case Position::DEF: return "DEF"; case Position::MID: return "MID"; case Position::ATT: return "ATT"; default: return "?"; }
}

// Player snapshot with live futbin-style prices.
struct Player {
	std::string id;          // futbin slug / card id
	std::string name;        // player name
	int rating;              // in-game base rating
	Position pos;
	std::string league;      // club / league (liquidity proxy)
	Coins buyPrice;          // best buy-now (BIN) we can acquire at
	Coins sellPrice;         // realistic quick-sell / list-floor
	double winRate;          // 0..1 — market popularity / meta-suitability (from community data)
	double volatility;       // 0..1 — price swing magnitude (higher risk)
	Coins priceLow;          // 30d low
	Coins priceHigh;         // 30d high
	std::string updated;     // data currency note
};

// Resell opportunity score. Higher = better buy->resell candidate.
struct MarketScore {
	Coins margin;        // sell - buy (net, after fee assumption 5%)
	Coins net;           // margin net of 5% sell fee
	double pctProfit;    // net / buy * 100
	double fitness;      // 0..1 — how liquid/meta the card is
	double risk;         // 0..1 — downside risk (volatility * (1-winRate))
	double composite;    // weighted score combining profit, fitness, risk
	const char* verdict; // "BUY", "HOLD_PASS", "AVOID", "WATCH"
};

inline double marketNet(Coins buy, Coins sell) {
	// Assume a ~5% market fee + quick-sell discount; conservative net.
	const double fee = 0.05;
	return sell * (1.0 - fee) - buy;
}

inline double normalize(double v, double lo, double hi) {
	return hi <= lo ? 0.0 : std::clamp((v - lo) / (hi - lo), 0.0, 1.0);
}

inline MarketScore evaluate(const Player& p) {
	const double net = marketNet(p.buyPrice, p.sellPrice);
	const double pct = p.buyPrice > 0 ? (net / p.buyPrice) * 100.0 : 0.0;
	// fitness: higher rating + winRate + liquid league (common leagues score a bit higher)
	const double fitness = std::clamp(0.6 * normalize((double)p.rating, 70, 95) + 0.4 * p.winRate, 0.0, 1.0);
	// risk: volatility pushes risk up; winRate pulls it down
	const double risk = std::clamp(p.volatility * (1.0 - p.winRate), 0.0, 1.0);
	// composite — favour net profit, punish risk, reward liquidity
	double composite = 1.5 * normalize(pct, -10, 40) + 0.4 * fitness - 0.8 * risk;
	composite = std::clamp(composite, 0.0, 2.0);

	const char* verdict = "WATCH";
	if (net <= 0) verdict = "AVOID";
	else if (pct < 5 && net > 0) verdict = "HOLD_PASS";
	else if (pct >= 15 && risk < 0.55) verdict = "BUY";
	else if (pct >= 5) verdict = "WATCH";

	return { p.sellPrice - p.buyPrice, net, pct, fitness, risk, composite, verdict };
}

// Sort candidates best-first by composite (desc), then net margin.
inline auto byOpportunity = [](const Player& a, const Player& b) {
	const auto sa = evaluate(a), sb = evaluate(b);
	if (sa.composite != sb.composite) return sa.composite > sb.composite;
	return sa.net > sb.net;
};

} // namespace fut