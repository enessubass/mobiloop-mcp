import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import App from "../src/App";

test("logs in with valid credentials", () => {
  render(<App />);

  fireEvent.changeText(screen.getByTestId("login.email"), "fixture@example.com");
  fireEvent.changeText(screen.getByTestId("login.password"), "123456");
  fireEvent.press(screen.getByTestId("login.submit"));

  expect(screen.getByText("Ana Sayfa")).toBeTruthy();
  expect(screen.getByText("Hoş geldiniz")).toBeTruthy();
});
