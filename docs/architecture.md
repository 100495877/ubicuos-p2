# Arquitectura

## Componentes

### 1. Controlador (móvil)
- Captura gestos
- Captura voz
- Envía eventos

### 2. Servidor
- Gestiona estado
- Coordina dispositivos
- Sincroniza en tiempo real

### 3. Pantalla ambiental
- Visualiza información
- Muestra feedback
- Representa el sistema

## Comunicación
Se utiliza comunicación en tiempo real mediante eventos para sincronizar el estado entre dispositivos.

## Distribución
La lógica se divide entre:
- Input: controlador
- Procesamiento: servidor
- Output: pantalla