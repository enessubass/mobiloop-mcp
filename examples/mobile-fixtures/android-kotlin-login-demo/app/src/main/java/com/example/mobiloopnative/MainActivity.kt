package com.example.mobiloopnative

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showLogin()
    }

    private fun showLogin() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val title = TextView(this).apply {
            text = "Giriş"
            textSize = 28f
            contentDescription = "Giriş"
        }
        val email = EditText(this).apply {
            id = R.id.email_field
            hint = "E-posta"
            contentDescription = "E-posta"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val password = EditText(this).apply {
            id = R.id.password_field
            hint = "Şifre"
            contentDescription = "Şifre"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val error = TextView(this).apply {
            id = R.id.error_text
            contentDescription = "Hata"
        }
        val button = Button(this).apply {
            id = R.id.login_button
            text = "Giriş Yap"
            contentDescription = "Giriş Yap"
            setOnClickListener {
                when {
                    !email.text.contains("@") -> error.text = "Geçerli e-posta girin"
                    password.text.length < 6 -> error.text = "Şifre en az 6 karakter olmalı"
                    else -> showHome()
                }
            }
        }

        layout.addView(title, rowParams())
        layout.addView(email, rowParams())
        layout.addView(password, rowParams())
        layout.addView(error, rowParams())
        layout.addView(button, rowParams())
        setContentView(layout)
    }

    private fun showHome() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val title = TextView(this).apply {
            id = R.id.home_title
            text = "Ana Sayfa"
            textSize = 28f
            contentDescription = "Ana Sayfa"
        }
        val welcome = TextView(this).apply {
            id = R.id.welcome_text
            text = "Hoş geldiniz"
            textSize = 20f
            contentDescription = "Hoş geldiniz"
        }
        layout.addView(title, rowParams())
        layout.addView(welcome, rowParams())
        setContentView(layout)
    }

    private fun rowParams(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            setMargins(0, 16, 0, 16)
        }
}

