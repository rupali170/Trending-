import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? "";

type AnalysisResult = {
  action: "BUY" | "SELL" | "WAIT";
  confidence: number;
  explanation: string;
};

type Stats = {
  total: number;
  right: number;
  wrong: number;
};

export default function TredarBiginScreen() {
  const insets = useSafeAreaInsets();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, right: 0, wrong: 0 });
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("tredar_stats").then((stored) => {
      if (stored) setStats(JSON.parse(stored));
    });
  }, []);

  const saveStats = async (s: Stats) => {
    setStats(s);
    await AsyncStorage.setItem("tredar_stats", JSON.stringify(s));
  };

  const pickAndAnalyze = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission", "Gallery access permission लागेल.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (res.canceled) return;

    const uri = res.assets[0].uri;
    setImageUri(uri);
    setResult(null);
    setFeedbackGiven(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setLoading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const body = {
        model: "gpt-4o",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: `तुम्ही expert trading chart analyst आहात. हा chart बघून खालील JSON format मध्ये फक्त उत्तर द्या (extra text नको):
{"action":"BUY किंवा SELL किंवा WAIT","confidence":55 ते 95 मधला number,"explanation":"2-3 lines Marathi मध्ये - chart मध्ये काय दिसतंय आणि का हा decision"}

Rules:
- Bullish pattern / uptrend / strong support → BUY
- Bearish pattern / downtrend / strong resistance → SELL  
- Unclear / sideways / no signal → WAIT
- Explanation Marathi मध्येच लिहा`,
              },
            ],
          },
        ],
      };

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : raw);

      const action: AnalysisResult["action"] = ["BUY", "SELL", "WAIT"].includes(
        parsed.action
      )
        ? parsed.action
        : "WAIT";

      setResult({
        action,
        confidence: Math.min(95, Math.max(55, Math.round(parsed.confidence))),
        explanation: parsed.explanation,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Analysis होऊ शकला नाही. Internet check करा.");
    } finally {
      setLoading(false);
    }
  };

  const markFeedback = async (isRight: boolean) => {
    if (!result || feedbackGiven) return;
    Haptics.selectionAsync();
    setFeedbackGiven(true);
    await saveStats({
      total: stats.total + 1,
      right: stats.right + (isRight ? 1 : 0),
      wrong: stats.wrong + (!isRight ? 1 : 0),
    });
  };

  const accuracy =
    stats.total > 0 ? Math.round((stats.right / stats.total) * 100) : 0;

  const actionColor =
    result?.action === "BUY"
      ? "#22c55e"
      : result?.action === "SELL"
      ? "#ef4444"
      : "#94a3b8";

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 12 },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Tredar Bigin 📈</Text>
        <Text style={styles.subtitle}>
          Chart screenshot → AI BUY / SELL / WAIT
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Gallery Button */}
        <TouchableOpacity
          style={[styles.pickButton, loading && { opacity: 0.6 }]}
          onPress={pickAndAnalyze}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Feather name="image" size={18} color="#020617" />
          <Text style={styles.pickButtonText}>
            {loading ? "Analyzing..." : "Gallery मधून Chart निवडा"}
          </Text>
        </TouchableOpacity>

        {/* Image Preview */}
        {imageUri && (
          <View style={styles.imageBox}>
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>
                  AI Chart analyze करत आहे...
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Analysis Result */}
        {result && !loading && (
          <View
            style={[styles.resultBox, { borderColor: actionColor }]}
          >
            <View style={styles.resultHeader}>
              <Text style={[styles.actionLabel, { color: actionColor }]}>
                {result.action === "BUY"
                  ? "⬆️ BUY"
                  : result.action === "SELL"
                  ? "⬇️ SELL"
                  : "⏸️ WAIT"}
              </Text>
              <View
                style={[
                  styles.confidenceBadge,
                  { backgroundColor: actionColor + "22" },
                ]}
              >
                <Text style={[styles.confidenceText, { color: actionColor }]}>
                  {result.confidence}% Confidence
                </Text>
              </View>
            </View>
            <Text style={styles.explanation}>{result.explanation}</Text>
          </View>
        )}

        {/* Right / Wrong Feedback */}
        {result && !loading && (
          <View style={styles.feedbackRow}>
            <TouchableOpacity
              style={[
                styles.feedbackBtn,
                { backgroundColor: "#22c55e", opacity: feedbackGiven ? 0.4 : 1 },
              ]}
              onPress={() => markFeedback(true)}
              disabled={feedbackGiven}
            >
              <Feather name="thumbs-up" size={16} color="#020617" />
              <Text style={styles.feedbackBtnText}>Right ✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.feedbackBtn,
                { backgroundColor: "#ef4444", opacity: feedbackGiven ? 0.4 : 1 },
              ]}
              onPress={() => markFeedback(false)}
              disabled={feedbackGiven}
            >
              <Feather name="thumbs-down" size={16} color="#020617" />
              <Text style={styles.feedbackBtnText}>Wrong ✗</Text>
            </TouchableOpacity>
          </View>
        )}

        {feedbackGiven && (
          <Text style={styles.feedbackDone}>
            Feedback saved! पुढच्या वेळी AI अधिक सुधारेल.
          </Text>
        )}

        {/* History */}
        <View style={styles.statsBox}>
          <Text style={styles.statsTitle}>📊 History</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: "#22c55e" }]}>
                {stats.right}
              </Text>
              <Text style={styles.statLabel}>Right</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: "#ef4444" }]}>
                {stats.wrong}
              </Text>
              <Text style={styles.statLabel}>Wrong</Text>
            </View>
            <View style={styles.statItem}>
              <Text
                style={[
                  styles.statNumber,
                  {
                    color:
                      accuracy >= 60
                        ? "#22c55e"
                        : accuracy >= 40
                        ? "#f1f5f9"
                        : "#ef4444",
                  },
                ]}
              >
                {stats.total > 0 ? `${accuracy}%` : "-"}
              </Text>
              <Text style={styles.statLabel}>Accuracy</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0E1A" },
  header: { paddingHorizontal: 20, marginBottom: 14 },
  title: { fontSize: 26, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 13, marginTop: 4, color: "#94a3b8" },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: "#6366f1",
  },
  pickButtonText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  imageBox: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  image: { width: "100%", height: "100%" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  resultBox: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    marginBottom: 14,
    backgroundColor: "#0f172a",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  actionLabel: { fontSize: 26, fontWeight: "800" },
  confidenceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  confidenceText: { fontSize: 13, fontWeight: "700" },
  explanation: { fontSize: 13, lineHeight: 20, color: "#94a3b8" },
  feedbackRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  feedbackBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  feedbackBtnText: { color: "#020617", fontWeight: "700", fontSize: 14 },
  feedbackDone: {
    textAlign: "center",
    fontSize: 12,
    color: "#64748b",
    marginBottom: 14,
  },
  statsBox: {
    marginTop: 6,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  statsTitle: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 12 },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  statItem: { alignItems: "center", flex: 1 },
  statNumber: { fontSize: 22, fontWeight: "700", color: "#f1f5f9" },
  statLabel: { fontSize: 11, marginTop: 2, color: "#64748b" },
});
