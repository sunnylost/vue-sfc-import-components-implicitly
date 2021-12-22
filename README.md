# Vue SFC Import Components Implicitly

```javascript
import checker from './src/index.mjs'

checker('./src/**/*.vue', {
    filter(tagName) {
        return !tagName.startsWith('el-')
    }
})

```
