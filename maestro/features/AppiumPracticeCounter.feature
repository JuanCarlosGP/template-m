@appium-practice @android @counter
Feature: Appium Practice - Counter
  Como usuario de la app de práctica
  Quiero usar el panel 01 COUNTER
  Para verificar incremento, decremento y reset del contador

  @smoke @happy-path
  Scenario: Operaciones completas del contador
    Given abro Appium Practice en la pantalla principal
    When entro en "01 COUNTER"
    Then el contador muestra "0"
    When pulso incrementar 3 veces
    Then el contador muestra "3"
    When pulso decrementar 1 vez
    Then el contador muestra "2"
    When pulso reset del contador
    Then el contador muestra "0"
    When pulso decrementar 2 veces
    Then el contador muestra "-2"
    When pulso reset del contador
    Then el contador muestra "0"
