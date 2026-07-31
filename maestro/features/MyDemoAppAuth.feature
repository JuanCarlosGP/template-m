Feature: Autenticación My Demo App
  Como usuario de My Demo App
  Quiero iniciar y cerrar sesión desde el menú lateral
  Para verificar el ciclo de autenticación demo

  Scenario: Login y logout con usuario demo
    Given abro My Demo App en la pantalla principal
    When abro el menú y pulso "Log In"
    And inicio sesión con usuario "bod@example.com" y contraseña "10203040"
    And abro el menú y pulso "Log Out"
    Then veo el texto "Are you sure you want to logout"
    When confirmo el logout en el diálogo
    Then veo el texto "Login"
