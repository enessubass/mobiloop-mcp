import React, { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

type Screen = "login" | "home";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");

  if (screen === "home") {
    return <HomeScreen />;
  }

  return <LoginScreen onSuccess={() => setScreen("home")} />;
}

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!email.includes("@")) {
      setError("Geçerli e-posta girin");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı");
      return;
    }
    setError(null);
    onSuccess();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Giriş</Text>
        <TextInput
          accessibilityLabel="E-posta"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-posta"
          style={styles.input}
          testID="login.email"
          value={email}
        />
        <TextInput
          accessibilityLabel="Şifre"
          onChangeText={setPassword}
          placeholder="Şifre"
          secureTextEntry
          style={styles.input}
          testID="login.password"
          value={password}
        />
        <Pressable
          accessibilityLabel="Giriş Yap"
          onPress={submit}
          style={styles.button}
          testID="login.submit"
        >
          <Text style={styles.buttonText}>Giriş Yap</Text>
        </Pressable>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="login.error">
            {error}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityLabel="Ana Sayfa" accessibilityRole="header" style={styles.title}>
          Ana Sayfa
        </Text>
        <Text style={styles.body}>Hoş geldiniz</Text>
      </View>
    </SafeAreaView>
  );
}

export const fixtureRoutes = {
  Login: LoginScreen,
  Home: HomeScreen
};

const styles = StyleSheet.create({
  body: {
    color: "#374151",
    fontSize: 18
  },
  button: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    marginTop: 12
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  card: {
    gap: 12,
    padding: 24,
    width: "100%"
  },
  error: {
    color: "#b91c1c",
    textAlign: "center"
  },
  input: {
    borderColor: "#9ca3af",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12
  },
  screen: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center"
  },
  title: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700"
  }
});
