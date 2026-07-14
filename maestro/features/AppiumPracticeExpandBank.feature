@appium-practice @android @expand-bank
Feature: Appium Practice - Expand Bank
  Como usuario de la app de práctica
  Quiero iniciar sesión en Expand Bank
  Para acceder al área autenticada

  @smoke @login @happy-path
  Scenario: Login en 12 EXPAND BANK con credenciales válidas
    Given abro Appium Practice en la pantalla principal
    Then veo el texto "The Practice App"
    When entro en "12 EXPAND BANK" e inicio sesión con usuario "practice" y clave "practice"
    Then veo el texto "Logout"
