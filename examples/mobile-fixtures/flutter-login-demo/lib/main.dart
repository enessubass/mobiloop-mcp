import 'package:flutter/material.dart';

void main() {
  runApp(const LoginDemoApp());
}

class LoginDemoApp extends StatelessWidget {
  const LoginDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MobiLoop Login Demo',
      home: const LoginScreen(),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  String? error;
  bool loggedIn = false;

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  void submit() {
    final email = emailController.text.trim();
    final password = passwordController.text;
    setState(() {
      if (!email.contains('@')) {
        error = 'Geçerli e-posta girin';
        loggedIn = false;
      } else if (password.length < 6) {
        error = 'Şifre en az 6 karakter olmalı';
        loggedIn = false;
      } else {
        error = null;
        loggedIn = true;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (loggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Ana Sayfa')),
        body: const Center(child: Text('Hoş geldiniz')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Giriş')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const ValueKey('email-field'),
              controller: emailController,
              decoration: const InputDecoration(labelText: 'E-posta'),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextField(
              key: const ValueKey('password-field'),
              controller: passwordController,
              decoration: const InputDecoration(labelText: 'Şifre'),
              obscureText: true,
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: submit,
              child: const Text('Giriş Yap'),
            ),
            if (error != null) ...[
              const SizedBox(height: 16),
              Text(error!, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

