import React from "react"
import { Block } from "baseui/block"
import useDesignEditorContext from "~/hooks/useDesignEditorContext"
import { readLaunchOptions } from "~/lib/launch"
import Logo from "~/components/Icons/Logo"
import { AQUA } from "~/lib/brand"

/**
 * Entry point. The AQUA app opens the Studio with ?format=...&template=...,
 * so there is nothing to choose here: the editor starts right away with the
 * requested artboard.
 */
const SelectEditor = () => {
  const { setEditorType } = useDesignEditorContext()

  React.useEffect(() => {
    setEditorType(readLaunchOptions().format.editor)
  }, [setEditorType])

  return (
    <Block
      $style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: AQUA.blue,
      }}
    >
      <Logo size={48} />
    </Block>
  )
}

export default SelectEditor
