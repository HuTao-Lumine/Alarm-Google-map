import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent gọi AppRegistry.registerComponent('main', () => App);
// Nó cũng đảm bảo môi trường Expo Go hoạt động chính xác
registerRootComponent(App);
