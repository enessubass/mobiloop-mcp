import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobiloop_flutter_login_demo/main.dart';

void main() {
  testWidgets('valid login reaches home', (tester) async {
    await tester.pumpWidget(const LoginDemoApp());
    await tester.enterText(find.byKey(const ValueKey('email-field')), 'test@example.com');
    await tester.enterText(find.byKey(const ValueKey('password-field')), '123456');
    await tester.tap(find.text('Giriş Yap'));
    await tester.pump();
    expect(find.text('Ana Sayfa'), findsOneWidget);
    expect(find.text('Hoş geldiniz'), findsOneWidget);
  });
}
