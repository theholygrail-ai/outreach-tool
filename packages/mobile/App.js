import React from "react";
import { StyleSheet, Text, View, SafeAreaView } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Outreach Tool</Text>
        <Text style={styles.subtitle}>
          Agentic Prospecting + Website MVP Engine
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    padding: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#e5e5e5",
  },
  subtitle: {
    fontSize: 14,
    color: "#737373",
    marginTop: 4,
  },
});
