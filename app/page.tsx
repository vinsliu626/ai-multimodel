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
              className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition transform hover:-translate-y-0.5"
            >
              立即体验聊天
            </a>
            <a
              href="#features"
              className="px-6 py-3 bg-white border rounded-lg shadow-sm hover:bg-gray-50 transition transform hover:-translate-y-0.5"
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
        </div>
        <p className="text-center text-gray-600 mt-3">
          在一个平台上使用多个模型，比单一模型更强、更智能、更高效。
        </p>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          <div className="p-8 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition transform hover:-translate-y-1">
            <h3 className="text-xl font-semibold">🚀 超高速推理</h3>
            <p className="mt-3 text-gray-600">
              Groq 加速模型带来行业领先的响应速度，写作、分析几乎无等待。
            </p>
          </div>

          <div className="p-8 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition transform hover:-translate-y-1">
            <h3 className="text-xl font-semibold">🧠 多智能体协作</h3>
            <p className="mt-3 text-gray-600">
              DeepSeek 负责推理结构，Kimi 负责表达优化，Groq 负责综合输出。
            </p>
          </div>

          <div className="p-8 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition transform hover:-translate-y-1">
            <h3 className="text-xl font-semibold">📚 一站式创作工具</h3>
            <p className="mt-3 text-gray-600">
              写作、课程生成、PPT、大纲、文案、训练营设计…… 统统一个平台搞定。
            </p>
          </div>
        </div>
      </section>

      {/* Multi-model Section：加动效展示区 */}
      <section className="py-24 px-6 bg-gray-900 relative overflow-hidden">
        {/* 背景渐变光晕 */}
        <div className="pointer-events-none absolute -top-32 -left-20 w-72 h-72 bg-blue-500/30 blur-3xl rounded-full animate-pulse" />
        <div className="pointer-events-none absolute -bottom-40 -right-10 w-80 h-80 bg-purple-500/25 blur-3xl rounded-full animate-pulse" />

        <div className="relative max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-white">
            多模型支持 · 你想用的我们都有
          </h2>
          <p className="text-center text-gray-300 mt-3">
            不同模型各司其职，在后台默默协作，只把最好的答案给你。
          </p>

          {/* 中间一条“模型协作线路图” */}
          <div className="mt-16 hidden md:block">
            <div className="relative flex items-center justify-between">
              {/* 连接线 */}
              <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-blue-500/0 via-blue-500/60 to-purple-500/0" />

              {/* Groq */}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400 animate-ping" />
                <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur border border-blue-400/40 shadow-md">
                  <div className="text-sm text-blue-300">⚡ Groq</div>
                  <div className="text-xs text-gray-200 mt-1">
                    极速响应 · 负责综合与输出
                  </div>
                </div>
              </div>

              {/* DeepSeek */}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur border border-emerald-400/40 shadow-md">
                  <div className="text-sm text-emerald-300">🧩 DeepSeek R1</div>
                  <div className="text-xs text-gray-200 mt-1">
                    结构拆解 · 深度推理
                  </div>
                </div>
              </div>

              {/* Kimi */}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-pink-400 animate-pulse" />
                <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur border border-pink-400/40 shadow-md">
                  <div className="text-sm text-pink-300">🎨 Kimi K2</div>
                  <div className="text-xs text-gray-200 mt-1">
                    中文表达 · 语气优化
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs text-center text-gray-400">
              模型在后台协作：先由 DeepSeek 拆解与推理，再由 Kimi 优化表达，最后由
              Groq 综合输出结果。
            </p>
          </div>

          {/* 下方卡片介绍（带 hover 动效） */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 bg-white/5 rounded-xl shadow-sm border border-white/10 hover:border-blue-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="font-semibold text-white">⚡ Groq（超快速 LLaMA）</h3>
              <p className="text-gray-300 mt-2 text-sm">
                极速响应 · 免费使用  
                适合日常聊天、快速写作、代码问答。
              </p>
              <span className="inline-block mt-3 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200">
                默认主力模型
              </span>
            </div>

            <div className="p-6 bg-white/5 rounded-xl shadow-sm border border-white/10 hover:border-emerald-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="font-semibold text-white">🧩 DeepSeek R1</h3>
              <p className="text-gray-300 mt-2 text-sm">
                更强的推理能力，适合做拆解、分析、决策辅助。
              </p>
              <span className="inline-block mt-3 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200">
                逻辑&思考专家
              </span>
            </div>

            <div className="p-6 bg-white/5 rounded-xl shadow-sm border border-white/10 hover:border-pink-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="font-semibold text-white">🎨 Kimi K2</h3>
              <p className="text-gray-300 mt-2 text-sm">
                中文风格自然，适合写文案、故事、课程介绍与脚本。
              </p>
              <span className="inline-block mt-3 text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-200">
                文案&表达助理
              </span>
            </div>

            <div className="p-6 bg-white/5 rounded-xl shadow-sm border border-white/10 hover:border-purple-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="font-semibold text-white">🤝 团队智能体模式</h3>
              <p className="text-gray-300 mt-2 text-sm">
                多模型同时思考、互相补充，再由一个“总编辑”给出最终答复。
              </p>
              <span className="inline-block mt-3 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200">
                多智能体协作
              </span>
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
          className="inline-block mt-10 px-10 py-4 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition transform hover:-translate-y-1"
        >
          进入 AI 工作台 →
        </a>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} 多模型 AI 平台 — Made by vins
      </footer>
    </main>
  );
}
