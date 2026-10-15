import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import App from "../src/App";

test("rejects invalid email", () => {
  render(<App />);
  fireEvent.changeText(screen.getByTestId("login.email"), "invalid");
  fireEvent.changeText(screen.getByTestId("login.password"), "123456");
  fireEvent.press(screen.getByTestId("login.submit"));
  expect(screen.getByText("Geçerli e-posta girin")).toBeTruthy();
  expect(screen.queryByText("Ana Sayfa")).toBeNull();
});

test("rejects a short password", () => {
  render(<App />);
  fireEvent.changeText(screen.getByTestId("login.email"), "fixture@example.invalid");
  fireEvent.changeText(screen.getByTestId("login.password"), "123");
  fireEvent.press(screen.getByTestId("login.submit"));
  expect(screen.getByText("Şifre en az 6 karakter olmalı")).toBeTruthy();
  expect(screen.queryByText("Ana Sayfa")).toBeNull();
});

test("logs in with valid credentials", () => {
  render(<App />);

  fireEvent.changeText(screen.getByTestId("login.email"), "fixture@example.com");
  fireEvent.changeText(screen.getByTestId("login.password"), "123456");
  fireEvent.press(screen.getByTestId("login.submit"));

  expect(screen.getByText("Ana Sayfa")).toBeTruthy();
  expect(screen.getByText("Hoş geldiniz")).toBeTruthy();
});
