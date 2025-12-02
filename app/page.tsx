export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="px-6 pt-20 pb-32 bg-gradient-to-b from-white to-gray-100">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl font-bold leading-tight text-gray-900">
            多模型 AI 工作台
            <span className="text-blue-600"> · 你的全能 AI 助手</span>
          </h1>

          <p className="mt-6 text-lg text-gray-600 leading-relaxed">
            支持 Groq、DeepSeek、Kimi、多智能体协作的下一代 AI 平台。
            <br />
            写作 · 分析 · 编程 · 教学 · 商业 · 训练营构建 —— 全部一站式完成。
          </p>

          <div className="mt-10 flex justify-center gap-4">
            <a
              href="/chat"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition"
            >
              立即体验聊天
            </a>
            <a
              href="#features"
              className="px-6 py-3 bg-white border rounded-lg shadow-sm hover:bg-gray-50 transition"
            >
              查看功能
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">
            为什么选择我们的 AI 平台？
          </h2>
          <p className="text-center text-gray-600 mt-3">
            在一个平台上使用多个模型，比单一模型更强、更智能、更高效。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            <div className="p-8 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition">
              <h3 className="text-xl font-semibold">🚀 超高速推理</h3>
              <p className="mt-3 text-gray-600">
                Groq 加速模型带来行业领先的响应速度，写作、分析几乎无等待。
              </p>
            </div>

            <div className="p-8 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition">
              <h3 className="text-xl font-semibold">🧠 多智能体协作</h3>
              <p className="mt-3 text-gray-600">
                DeepSeek 负责推理结构，Kimi 负责表达优化，Groq 负责综合输出。
              </p>
            </div>

            <div className="p-8 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition">
              <h3 className="text-xl font-semibold">📚 一站式创作工具</h3>
              <p className="mt-3 text-gray-600">
                写作、课程生成、PPT、大纲、文案、训练营设计…… 统统一个平台搞定。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Multi-model Section */}
      <section className="py-24 px-6 bg-gray-100">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">
            多模型支持 · 你想用的我们都有
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-16">
            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-semibold">⚡ Groq（超快速 LLaMA）</h3>
              <p className="text-gray-600 mt-2">极速响应 · 免费使用</p>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-semibold">🧩 DeepSeek R1</h3>
              <p className="text-gray-600 mt-2">推理更强 · 分析更准</p>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-semibold">🎨 Kimi K2</h3>
              <p className="text-gray-600 mt-2">表达自然 · 中文更友好</p>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-semibold">🤝 团队智能体模式</h3>
              <p className="text-gray-600 mt-2">三模型协作 · 输出最优解</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-white text-center">
        <h2 className="text-3xl font-bold text-gray-900">
          准备好体验未来 AI 工作方式了吗？
        </h2>
        <p className="mt-4 text-gray-600 text-lg">
          立即开始对话，体验多模型智能协作带来的生产力提升。
        </p>

        <a
          href="/chat"
          className="inline-block mt-10 px-10 py-4 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition"
        >
          进入 AI 工作台 →
        </a>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} 多模型 AI 平台 — Made by vinsliu626
      </footer>
    </main>
  );
}
