import { Hono } from 'hono'
import authRouter from './routes/auth.router'
import { errorHandler } from './middleware/error-handler'

const app = new Hono()

app.use('*', errorHandler())
app.route('/auth', authRouter)

export default app